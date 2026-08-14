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
 */
import type { Pool, PoolClient } from "pg";
import { getPool } from "./db.server.ts";

export const SYNCED_TABLES = new Set([
  "pages",
  "blocks",
  "databases",
  "database_rows",
]);

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
  status: number;
  headers: Record<string, string>;
  body: string;
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

/** Full-snapshot response for `offset=-1`. */
async function snapshot(
  pool: Pool,
  table: string,
  workspaceId: string
): Promise<ShapeResponse> {
  const client = await pool.connect();
  try {
    // Tail is read BEFORE the rows: a commit landing between the two reads is
    // then both in the snapshot and replayed later as an update (harmless —
    // the collection downgrades duplicate inserts), never lost.
    const tail = await readLogTail(client);
    const rows = await client.query(
      `select id, doc from ${table} where workspace_id = $1`,
      [workspaceId]
    );
    const messages: ShapeMessage[] = rows.rows.map((row) => ({
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
  id: string;
  row_id: string;
  op: "insert" | "update" | "delete";
  txid: string;
  doc: Record<string, unknown> | null;
}

async function readLogAfter(
  pool: Pool,
  table: string,
  workspaceId: string,
  after: number
): Promise<LogEntry[]> {
  const result = await pool.query(
    `select id::text, row_id, op, txid::text, doc from shape_log
     where workspace_id = $1 and tbl = $2 and id > $3 order by id asc`,
    [workspaceId, table, after]
  );
  return result.rows;
}

function changesResponse(
  table: string,
  entries: LogEntry[],
  fallbackOffset: string,
  live: boolean
): ShapeResponse {
  const messages: ShapeMessage[] = entries.map((entry) => ({
    headers: { operation: entry.op, txids: [Number(entry.txid)] },
    key: rowKey(table, entry.row_id),
    value:
      entry.op === "delete" ? { id: entry.row_id } : (entry.doc ?? undefined),
  }));
  messages.push(UP_TO_DATE);
  const offset =
    entries.length > 0 ? `${entries.at(-1)?.id}_0` : fallbackOffset;
  const headers = baseHeaders(offset);
  if (live) {
    headers["electric-cursor"] = nextCursor();
  }
  return { status: 200, headers, body: JSON.stringify(messages) };
}

// ── Live-poll wakeups via LISTEN/NOTIFY ──────────────────────────────────────

type Waiter = { workspaceId: string; wake: () => void };
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
  offset: string;
  handle?: string;
  live: boolean;
}): Promise<ShapeResponse> {
  const { table, workspaceId, offset, handle, live } = params;
  const pool = getPool();
  await ensureListener(pool);

  if (offset === "-1") {
    return await snapshot(pool, table, workspaceId);
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

  let entries = await readLogAfter(pool, table, workspaceId, after);
  if (live && entries.length === 0) {
    await waitForChange(workspaceId, LIVE_HOLD_MS);
    entries = await readLogAfter(pool, table, workspaceId, after);
  }
  return changesResponse(table, entries, offset, live);
}
