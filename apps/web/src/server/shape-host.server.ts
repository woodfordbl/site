/**
 * Dev shape host: serves workspace content over ElectricSQL's HTTP shape
 * protocol, backed by the trigger-fed `shape_log` table instead of logical
 * replication. The client side is the unmodified `@electric-sql/client`
 * ShapeStream + `@tanstack/electric-db-collection` — pointing them at real
 * Electric later is a URL swap.
 *
 * Protocol contract: scratchpad shape-protocol-contract.md (extracted from
 * @electric-sql/client 1.5.26 + electric-db-collection 0.3.18). Load-bearing
 * rules honored here:
 * - `electric-offset` + `electric-handle` on every 2xx; `electric-schema` on
 *   all of them (required on non-live); `electric-cursor` on live responses,
 *   bumped every time (a constant cursor drops resyncs after quick reloads).
 * - The `up-to-date` control message is always the LAST array element.
 * - Offsets are opaque `${n}_0` strings (shape_log ids); handles are minted per
 *   boot — an unknown handle gets a 409 + `must-refetch` body so clients
 *   re-snapshot after a server restart.
 * - `txids` are JSON numbers on change messages; deletes carry the PK in
 *   `value`. Values are JSON natives under an empty schema (identity parsing).
 * - Live polls park on Postgres NOTIFY ('shape_log', workspace_id) and resolve
 *   promptly on writes so `awaitTxId` (5s default) never times out.
 *
 * Access model (ReBAC step 2):
 * - `pages` and `blocks` shapes are scoped to the requesting user via the
 *   `user_page_access` projection — both the snapshot and live change entries.
 *   `databases`/`database_rows` stay workspace-scoped (not in the page tree).
 * - Synthetic-delete contract: a live pages/blocks change whose page is NOT in
 *   the user's current access set is emitted as a `delete` for that row id,
 *   unconditionally — deleting a row the client never had is a no-op for
 *   TanStack DB, and it converges clients that did have it (live revocation).
 * - Access transitions ride the `user_page_access` log entries (migration
 *   0004): a grant for the requesting user replays the page (and its blocks on
 *   the blocks shape) as inserts — duplicate inserts downgrade client-side —
 *   and a revocation emits synthetic deletes for the page and its blocks.
 * - `my_access` pseudo-shape ({@link ACCESS_TABLE}): the caller's own
 *   user_page_access rows, keyed by page id, value `{pageId, level}` (deletes
 *   carry `{pageId}`), so clients can react to their own permission changes.
 */
import type { Pool, PoolClient } from "pg";
import { getPool } from "./db.server.ts";

export const SYNCED_TABLES = new Set([
  "pages",
  "blocks",
  "databases",
  "database_rows",
]);

/**
 * Read-only pseudo-shape streaming the requesting user's own
 * `user_page_access` rows (id = page id, value = `{pageId, level}`).
 */
export const ACCESS_TABLE = "my_access";

/** shape_log.tbl value written by the migration-0004 projection trigger. */
const ACCESS_LOG_TBL = "user_page_access";

/** Tables whose shapes are filtered per user via user_page_access. */
const ACCESS_SCOPED = new Set(["pages", "blocks"]);

const LIVE_HOLD_MS = 25_000;
const HANDLE = `dev-${Date.now().toString(36)}`;

let cursorCounter = 0;

function nextCursor(): string {
  cursorCounter += 1;
  return `${Date.now()}-${cursorCounter}`;
}

interface ShapeMessage {
  headers: Record<string, unknown>;
  key?: string;
  value?: Record<string, unknown>;
}

export interface ShapeResponse {
  body: string;
  headers: Record<string, string>;
  status: number;
}

const UP_TO_DATE: ShapeMessage = { headers: { control: "up-to-date" } };

function rowKey(table: string, id: string): string {
  return `"public"."${table}"/"${id}"`;
}

function baseHeaders(offset: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "electric-handle": HANDLE,
    "electric-offset": offset,
    "electric-schema": "{}",
    "electric-up-to-date": "true",
    "cache-control": "no-store",
  };
}

async function readLogTail(client: PoolClient): Promise<number> {
  const result = await client.query(
    "select coalesce(max(id), 0)::text as tail from shape_log"
  );
  return Number(result.rows[0].tail);
}

/** Snapshot rows for one shape, already access-filtered for the user. */
async function snapshotRows(
  client: PoolClient,
  table: string,
  workspaceId: string,
  userId: string
): Promise<Array<{ id: string; doc: Record<string, unknown> }>> {
  if (table === ACCESS_TABLE) {
    const result = await client.query(
      `select page_id as id,
              jsonb_build_object('pageId', page_id, 'level', level) as doc
       from user_page_access where workspace_id = $1 and user_id = $2`,
      [workspaceId, userId]
    );
    return result.rows;
  }
  if (ACCESS_SCOPED.has(table)) {
    const column = table === "pages" ? "id" : "page_id";
    const result = await client.query(
      `select id, doc from ${table}
       where workspace_id = $1 and ${column} in
         (select page_id from user_page_access
          where workspace_id = $1 and user_id = $2)`,
      [workspaceId, userId]
    );
    return result.rows;
  }
  const result = await client.query(
    `select id, doc from ${table} where workspace_id = $1`,
    [workspaceId]
  );
  return result.rows;
}

/** Full-snapshot response for `offset=-1`. */
async function snapshot(
  pool: Pool,
  table: string,
  workspaceId: string,
  userId: string
): Promise<ShapeResponse> {
  const client = await pool.connect();
  try {
    // Tail is read BEFORE the rows: a commit landing between the two reads is
    // then both in the snapshot and replayed later as an update (harmless —
    // the collection downgrades duplicate inserts), never lost.
    const tail = await readLogTail(client);
    const rows = await snapshotRows(client, table, workspaceId, userId);
    const messages: ShapeMessage[] = rows.map((row) => ({
      headers: { operation: "insert" },
      key: rowKey(table, row.id),
      value: row.doc,
    }));
    messages.push(UP_TO_DATE);
    return {
      status: 200,
      headers: baseHeaders(`${tail}_0`),
      body: JSON.stringify(messages),
    };
  } finally {
    client.release();
  }
}

interface LogEntry {
  doc: Record<string, unknown> | null;
  id: string;
  op: "insert" | "update" | "delete";
  row_id: string;
  tbl: string;
  txid: string;
}

/**
 * Log entries relevant to one shape. Access-scoped shapes (and `my_access`)
 * also read the user's own `user_page_access` entries so access transitions
 * surface on the stream; the user filter matches doc->>'userId', which the
 * 0004 trigger writes on every op, deletes included.
 */
async function readLogAfter(
  pool: Pool,
  table: string,
  workspaceId: string,
  userId: string,
  after: number
): Promise<LogEntry[]> {
  const base =
    "select id::text, tbl, row_id, op, txid::text, doc from shape_log where workspace_id = $1 and id > $2";
  if (table === ACCESS_TABLE) {
    const result = await pool.query(
      `${base} and tbl = '${ACCESS_LOG_TBL}' and doc ->> 'userId' = $3 order by id asc`,
      [workspaceId, after, userId]
    );
    return result.rows;
  }
  if (ACCESS_SCOPED.has(table)) {
    const result = await pool.query(
      `${base} and (tbl = $3 or (tbl = '${ACCESS_LOG_TBL}' and doc ->> 'userId' = $4))
       order by id asc`,
      [workspaceId, after, table, userId]
    );
    return result.rows;
  }
  const result = await pool.query(`${base} and tbl = $3 order by id asc`, [
    workspaceId,
    after,
    table,
  ]);
  return result.rows;
}

function changeMessage(table: string, entry: LogEntry): ShapeMessage {
  return {
    headers: { operation: entry.op, txids: [Number(entry.txid)] },
    key: rowKey(table, entry.row_id),
    value:
      entry.op === "delete" ? { id: entry.row_id } : (entry.doc ?? undefined),
  };
}

function syntheticDelete(
  table: string,
  id: string,
  txid: string
): ShapeMessage {
  return {
    headers: { operation: "delete", txids: [Number(txid)] },
    key: rowKey(table, id),
    value: { id },
  };
}

function accessMessage(entry: LogEntry): ShapeMessage {
  const value: Record<string, unknown> = { pageId: entry.row_id };
  if (entry.op !== "delete" && typeof entry.doc?.level === "string") {
    value.level = entry.doc.level;
  }
  return {
    headers: { operation: entry.op, txids: [Number(entry.txid)] },
    key: rowKey(ACCESS_TABLE, entry.row_id),
    value,
  };
}

/** The page ids the user can currently see in this workspace. */
async function fetchAccessSet(
  pool: Pool,
  workspaceId: string,
  userId: string
): Promise<Set<string>> {
  const result = await pool.query(
    "select page_id from user_page_access where workspace_id = $1 and user_id = $2",
    [workspaceId, userId]
  );
  return new Set(result.rows.map((row: { page_id: string }) => row.page_id));
}

/**
 * Live pages-shape messages: pages entries outside the access set become
 * synthetic deletes; grant entries replay the page as an insert (or a delete
 * when the page vanished before the poll), revocations delete it.
 */
async function pagesMessages(
  pool: Pool,
  workspaceId: string,
  userId: string,
  entries: LogEntry[]
): Promise<ShapeMessage[]> {
  const access = await fetchAccessSet(pool, workspaceId, userId);
  const grantedIds = entries
    .filter((e) => e.tbl === ACCESS_LOG_TBL && e.op !== "delete")
    .map((e) => e.row_id);
  const docs = new Map<string, Record<string, unknown>>();
  if (grantedIds.length > 0) {
    const result = await pool.query(
      "select id, doc from pages where workspace_id = $1 and id = any ($2)",
      [workspaceId, grantedIds]
    );
    for (const row of result.rows) {
      docs.set(row.id, row.doc);
    }
  }
  return entries.map((entry) => {
    if (entry.tbl === ACCESS_LOG_TBL) {
      const doc = docs.get(entry.row_id);
      if (entry.op === "delete" || !doc) {
        return syntheticDelete("pages", entry.row_id, entry.txid);
      }
      return {
        headers: { operation: "insert", txids: [Number(entry.txid)] },
        key: rowKey("pages", entry.row_id),
        value: doc,
      };
    }
    if (entry.op !== "delete" && !access.has(entry.row_id)) {
      return syntheticDelete("pages", entry.row_id, entry.txid);
    }
    return changeMessage("pages", entry);
  });
}

/**
 * Live blocks-shape messages: block entries whose page (doc.pageId) is outside
 * the access set become synthetic deletes; grant/revocation entries expand to
 * inserts/deletes of every current block on the affected page.
 */
async function blocksMessages(
  pool: Pool,
  workspaceId: string,
  userId: string,
  entries: LogEntry[]
): Promise<ShapeMessage[]> {
  const access = await fetchAccessSet(pool, workspaceId, userId);
  const affectedPages = entries
    .filter((e) => e.tbl === ACCESS_LOG_TBL)
    .map((e) => e.row_id);
  const byPage = new Map<
    string,
    Array<{ id: string; doc: Record<string, unknown> }>
  >();
  if (affectedPages.length > 0) {
    const result = await pool.query(
      "select id, page_id, doc from blocks where workspace_id = $1 and page_id = any ($2)",
      [workspaceId, affectedPages]
    );
    for (const row of result.rows) {
      const list = byPage.get(row.page_id) ?? [];
      list.push({ id: row.id, doc: row.doc });
      byPage.set(row.page_id, list);
    }
  }
  const messages: ShapeMessage[] = [];
  for (const entry of entries) {
    if (entry.tbl === ACCESS_LOG_TBL) {
      for (const block of byPage.get(entry.row_id) ?? []) {
        messages.push(
          entry.op === "delete"
            ? syntheticDelete("blocks", block.id, entry.txid)
            : {
                headers: { operation: "insert", txids: [Number(entry.txid)] },
                key: rowKey("blocks", block.id),
                value: block.doc,
              }
        );
      }
      continue;
    }
    const pageId = entry.doc?.pageId;
    if (
      entry.op !== "delete" &&
      !(typeof pageId === "string" && access.has(pageId))
    ) {
      messages.push(syntheticDelete("blocks", entry.row_id, entry.txid));
      continue;
    }
    messages.push(changeMessage("blocks", entry));
  }
  return messages;
}

async function entriesToMessages(
  pool: Pool,
  table: string,
  workspaceId: string,
  userId: string,
  entries: LogEntry[]
): Promise<ShapeMessage[]> {
  if (entries.length === 0) {
    return [];
  }
  if (table === ACCESS_TABLE) {
    return entries.map(accessMessage);
  }
  if (table === "pages") {
    return await pagesMessages(pool, workspaceId, userId, entries);
  }
  if (table === "blocks") {
    return await blocksMessages(pool, workspaceId, userId, entries);
  }
  return entries.map((entry) => changeMessage(table, entry));
}

function changesResponse(
  messages: ShapeMessage[],
  entries: LogEntry[],
  fallbackOffset: string,
  live: boolean
): ShapeResponse {
  const body = [...messages, UP_TO_DATE];
  const offset =
    entries.length > 0 ? `${entries.at(-1)?.id}_0` : fallbackOffset;
  const headers = baseHeaders(offset);
  if (live) {
    headers["electric-cursor"] = nextCursor();
  }
  return { status: 200, headers, body: JSON.stringify(body) };
}

// ── Live-poll wakeups via LISTEN/NOTIFY ──────────────────────────────────────

interface Waiter {
  wake: () => void;
  workspaceId: string;
}
const waiters = new Set<Waiter>();
let listenerStarted = false;

async function ensureListener(pool: Pool): Promise<void> {
  if (listenerStarted) {
    return;
  }
  listenerStarted = true;
  const client = await pool.connect();
  await client.query("listen shape_log");
  client.on("notification", (message) => {
    for (const waiter of waiters) {
      if (waiter.workspaceId === message.payload) {
        waiter.wake();
      }
    }
  });
  client.on("error", () => {
    listenerStarted = false;
    client.release();
  });
}

function waitForChange(workspaceId: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const waiter: Waiter = { workspaceId, wake: () => finish() };
    const timer = setTimeout(() => finish(), timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      waiters.delete(waiter);
      resolve();
    };
    waiters.add(waiter);
  });
}

// ── Request handling ─────────────────────────────────────────────────────────

const MUST_REFETCH_BODY = JSON.stringify([
  { headers: { control: "must-refetch" } },
]);

export async function handleShapeRequest(params: {
  table: string;
  workspaceId: string;
  userId: string;
  offset: string;
  handle?: string;
  live: boolean;
}): Promise<ShapeResponse> {
  const { table, workspaceId, userId, offset, handle, live } = params;
  const pool = getPool();
  await ensureListener(pool);

  if (offset === "-1") {
    return await snapshot(pool, table, workspaceId, userId);
  }

  if (handle !== HANDLE) {
    return {
      status: 409,
      headers: {
        "content-type": "application/json",
        "electric-handle": HANDLE,
      },
      body: MUST_REFETCH_BODY,
    };
  }

  const after = Number(offset.split("_")[0]);
  if (!Number.isFinite(after)) {
    return {
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: `Malformed offset ${offset}` }),
    };
  }

  let entries = await readLogAfter(pool, table, workspaceId, userId, after);
  if (live && entries.length === 0) {
    await waitForChange(workspaceId, LIVE_HOLD_MS);
    entries = await readLogAfter(pool, table, workspaceId, userId, after);
  }
  const messages = await entriesToMessages(
    pool,
    table,
    workspaceId,
    userId,
    entries
  );
  return changesResponse(messages, entries, offset, live);
}
