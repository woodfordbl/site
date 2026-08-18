import { defineHandler, HTTPError, readBody } from "nitro/h3";
import {
  getSession,
  isWorkspaceMember,
} from "../../../src/server/auth.server.ts";
import { getPool } from "../../../src/server/db.server.ts";

/**
 * `POST /api/sync/mutate` — the sync engine's write path.
 *
 * Applies a batch of document mutations in ONE Postgres transaction and
 * returns the transaction's txid (`pg_current_xact_id()::xid`, captured inside
 * the transaction — the same value the shape log's trigger records), so
 * TanStack DB's electric collection can hold the optimistic overlay until the
 * change comes back on the shape stream.
 *
 * Update semantics are per-top-level-key patches (`doc = doc || $changes`,
 * `null` deleting the key), not whole-document replacement — see the sync
 * proposal §6.1. TanStack DB's `transaction.mutations[].changes` is already a
 * shallow diff, so concurrent editors of different keys on one document
 * (e.g. a page's `title` vs its `blockOrder`) do not clobber each other.
 *
 * ReBAC enforcement (per mutation, inside the transaction, before applying —
 * so an earlier mutation in the batch, e.g. a page insert, is visible to a
 * later check, e.g. its blocks): pages/blocks writes require `can_access` on
 * the target page — insert/update need 'edit', page deletes 'full_access',
 * block deletes 'edit'. A brand-new page needs only workspace membership plus
 * 'edit' on its parent when it has one. Mutations whose target row does not
 * exist (miss-converge path) skip the check — they apply to zero rows and
 * only produce a synthetic delete. `databases`/`database_rows` stay at
 * workspace-membership-only for now: databases are not part of the page tree
 * yet, so no page-level ACL applies to them. Denials abort the whole batch
 * with a 403 `{error: "forbidden", table, id}` — the client treats non-2xx
 * as a rejected optimistic transaction, the correct UX for revoked access.
 */

const SYNCED_TABLES = {
  pages: { fk: null },
  blocks: { fk: "page_id" },
  databases: { fk: null },
  database_rows: { fk: "database_id" },
} as const;

type SyncedTable = keyof typeof SYNCED_TABLES;

interface Mutation {
  /** Full document for inserts; shallow key diff for updates. */
  doc?: Record<string, unknown>;
  id: string;
  op: "insert" | "update" | "delete";
  table: SyncedTable;
}

// Ids are uuids for user-created rows but slugs for shipped content seeded
// into a workspace (the home page's id is literally "home"), so validate
// shape, not uuid-ness.
const ID_RE = /^[\w.:-]{1,128}$/;
const MAX_MUTATIONS = 200;

function parentIdOf(mutation: Mutation): string | null {
  const doc = mutation.doc ?? {};
  const key = mutation.table === "blocks" ? "pageId" : "databaseId";
  const value = doc[key];
  return typeof value === "string" ? value : null;
}

function assertValid(mutation: Mutation): void {
  if (!(mutation.table in SYNCED_TABLES)) {
    throw HTTPError.status(400, `Unknown table ${String(mutation.table)}`);
  }
  if (!ID_RE.test(mutation.id)) {
    throw HTTPError.status(400, "Malformed row id");
  }
  if (mutation.op !== "delete" && typeof mutation.doc !== "object") {
    throw HTTPError.status(400, "Insert/update mutations need a doc");
  }
  if (mutation.op === "insert" && SYNCED_TABLES[mutation.table].fk) {
    const parent = parentIdOf(mutation);
    if (!(parent && ID_RE.test(parent))) {
      throw HTTPError.status(400, `${mutation.table} inserts need a parent id`);
    }
  }
}

/** Marks a mutation the session user may not apply; aborts the whole batch. */
class ForbiddenMutation extends Error {
  readonly table: string;
  readonly id: string;

  constructor(table: string, id: string) {
    super(`forbidden ${table} mutation on ${id}`);
    this.table = table;
    this.id = id;
  }
}

async function canAccess(
  client: import("pg").PoolClient,
  userId: string,
  pageId: string,
  level: "edit" | "full_access"
): Promise<boolean> {
  const result = await client.query("select can_access($1, $2, $3) as ok", [
    userId,
    pageId,
    level,
  ]);
  return result.rows[0]?.ok === true;
}

async function requirePagesAccess(
  client: import("pg").PoolClient,
  userId: string,
  workspaceId: string,
  mutation: Mutation
): Promise<void> {
  const exists = await client.query(
    "select 1 from pages where id = $1 and workspace_id = $2",
    [mutation.id, workspaceId]
  );
  if (exists.rowCount === 0) {
    if (mutation.op !== "insert") {
      return; // Applies to zero rows; converges via the logMiss path.
    }
    // New page: workspace membership (already checked) is enough at the root;
    // creating under a parent requires 'edit' on that parent.
    const parent = mutation.doc?.parentId;
    if (
      typeof parent === "string" &&
      !(await canAccess(client, userId, parent, "edit"))
    ) {
      throw new ForbiddenMutation(mutation.table, mutation.id);
    }
    return;
  }
  const needed = mutation.op === "delete" ? "full_access" : "edit";
  if (!(await canAccess(client, userId, mutation.id, needed))) {
    throw new ForbiddenMutation(mutation.table, mutation.id);
  }
}

async function requireBlocksAccess(
  client: import("pg").PoolClient,
  userId: string,
  workspaceId: string,
  mutation: Mutation
): Promise<void> {
  const existing = await client.query(
    "select page_id from blocks where id = $1 and workspace_id = $2",
    [mutation.id, workspaceId]
  );
  const pageId =
    existing.rows[0]?.page_id ??
    (mutation.op === "insert" ? parentIdOf(mutation) : null);
  if (!pageId) {
    return; // Applies to zero rows; converges via the logMiss path.
  }
  if (!(await canAccess(client, userId, pageId, "edit"))) {
    throw new ForbiddenMutation(mutation.table, mutation.id);
  }
}

/**
 * Enforces the per-mutation ReBAC matrix (see the fileoverview). Throws
 * {@link ForbiddenMutation} on denial; databases/database_rows pass on
 * workspace membership alone.
 */
async function requireAccess(
  client: import("pg").PoolClient,
  userId: string,
  workspaceId: string,
  mutation: Mutation
): Promise<void> {
  if (mutation.table === "pages") {
    await requirePagesAccess(client, userId, workspaceId, mutation);
  } else if (mutation.table === "blocks") {
    await requireBlocksAccess(client, userId, workspaceId, mutation);
  }
}

/**
 * Every mutation in an acknowledged transaction must surface its txid on the
 * shape stream — TanStack DB holds the optimistic overlay until then. A
 * mutation matching zero rows fires no trigger, so record a synthetic delete
 * (a no-op client-side for rows that never synced).
 */
async function logMiss(
  client: import("pg").PoolClient,
  table: string,
  workspaceId: string,
  id: string
): Promise<void> {
  await client.query(
    `insert into shape_log (tbl, workspace_id, row_id, op, txid, doc)
     values ($1, $2, $3, 'delete', (pg_current_xact_id()::xid::text)::bigint, null)`,
    [table, workspaceId, id]
  );
  await client.query("select pg_notify('shape_log', $1)", [workspaceId]);
}

async function applyMutation(
  client: import("pg").PoolClient,
  workspaceId: string,
  mutation: Mutation
): Promise<void> {
  const { table, op, id } = mutation;
  const fk = SYNCED_TABLES[table].fk;
  if (op === "insert") {
    const doc = JSON.stringify(mutation.doc);
    const columns = fk
      ? `id, workspace_id, ${fk}, doc`
      : "id, workspace_id, doc";
    const placeholders = fk ? "$1, $2, $3, $4" : "$1, $2, $3";
    const values = fk
      ? [id, workspaceId, parentIdOf(mutation), doc]
      : [id, workspaceId, doc];
    await client.query(
      `insert into ${table} (${columns}) values (${placeholders})
       on conflict (id) do update set doc = excluded.doc
         where ${table}.workspace_id = $2`,
      values
    );
    return;
  }
  const result =
    op === "update"
      ? await client.query(
          `update ${table} set doc = doc || $3::jsonb
             where id = $1 and workspace_id = $2`,
          [id, workspaceId, JSON.stringify(mutation.doc)]
        )
      : await client.query(
          `delete from ${table} where id = $1 and workspace_id = $2`,
          [id, workspaceId]
        );
  if (result.rowCount === 0) {
    // The row doesn't exist server-side (e.g. an edit raced a deletion). Log
    // a synthetic delete so this txid still reaches every waiting client and
    // their optimistic state converges to server truth.
    await logMiss(client, table, workspaceId, id);
  }
}

export default defineHandler(async (event) => {
  const session = await getSession(event.req.headers);
  if (!session) {
    throw HTTPError.status(401, "Not signed in");
  }
  const body = await readBody<{ workspaceId?: string; mutations?: Mutation[] }>(
    event
  );
  const workspaceId = body?.workspaceId;
  const mutations = body?.mutations;
  if (!(workspaceId && Array.isArray(mutations)) || mutations.length === 0) {
    throw HTTPError.status(400, "workspaceId and mutations are required");
  }
  if (mutations.length > MAX_MUTATIONS) {
    throw HTTPError.status(400, "Too many mutations in one batch");
  }
  if (!(await isWorkspaceMember(session.user.id, workspaceId))) {
    throw HTTPError.status(403, "Not a member of this workspace");
  }
  for (const mutation of mutations) {
    assertValid(mutation);
  }

  const client = await getPool().connect();
  try {
    await client.query("begin");
    for (const mutation of mutations) {
      await requireAccess(client, session.user.id, workspaceId, mutation);
      await applyMutation(client, workspaceId, mutation);
    }
    const txidResult = await client.query(
      "select pg_current_xact_id()::xid::text as txid"
    );
    await client.query("commit");
    return { txid: Number(txidResult.rows[0].txid) };
  } catch (error) {
    await client.query("rollback");
    if (error instanceof ForbiddenMutation) {
      event.res.status = 403;
      return { error: "forbidden", table: error.table, id: error.id };
    }
    throw error;
  } finally {
    client.release();
  }
});
