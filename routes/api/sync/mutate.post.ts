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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if (!UUID_RE.test(mutation.id)) {
    throw HTTPError.status(400, "Row ids must be UUIDs");
  }
  if (mutation.op !== "delete" && typeof mutation.doc !== "object") {
    throw HTTPError.status(400, "Insert/update mutations need a doc");
  }
  if (mutation.op === "insert" && SYNCED_TABLES[mutation.table].fk) {
    const parent = parentIdOf(mutation);
    if (!(parent && UUID_RE.test(parent))) {
      throw HTTPError.status(400, `${mutation.table} inserts need a parent id`);
    }
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
      const { table, op, id } = mutation;
      const fk = SYNCED_TABLES[table].fk;
      if (op === "insert") {
        const doc = JSON.stringify(mutation.doc);
        if (fk) {
          await client.query(
            `insert into ${table} (id, workspace_id, ${fk}, doc)
             values ($1, $2, $3, $4)
             on conflict (id) do update set doc = excluded.doc
               where ${table}.workspace_id = $2`,
            [id, workspaceId, parentIdOf(mutation), doc]
          );
        } else {
          await client.query(
            `insert into ${table} (id, workspace_id, doc)
             values ($1, $2, $3)
             on conflict (id) do update set doc = excluded.doc
               where ${table}.workspace_id = $2`,
            [id, workspaceId, doc]
          );
        }
      } else if (op === "update") {
        await client.query(
          `update ${table} set doc = doc || $3::jsonb
             where id = $1 and workspace_id = $2`,
          [id, workspaceId, JSON.stringify(mutation.doc)]
        );
      } else {
        await client.query(
          `delete from ${table} where id = $1 and workspace_id = $2`,
          [id, workspaceId]
        );
      }
    }
    const txidResult = await client.query(
      "select pg_current_xact_id()::xid::text as txid"
    );
    await client.query("commit");
    return { txid: Number(txidResult.rows[0].txid) };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
});
