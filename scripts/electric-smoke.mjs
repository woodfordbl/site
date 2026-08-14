/**
 * Smoke test for the local sync stack (dev/electric/docker-compose.yaml).
 *
 * Proves the whole Phase 0 pipe (docs/proposals/realtime-sync-engine.md §9):
 * Postgres commit → logical replication → Electric shape log → HTTP client.
 *
 * Run `pnpm electric:up` first, then `pnpm electric:smoke`. Uses `docker exec`
 * for SQL (no pg client dependency) and global fetch for the shape API.
 */
import { execFileSync } from "node:child_process";

const ELECTRIC_URL = process.env.ELECTRIC_URL ?? "http://localhost:3010";
const ELECTRIC_SECRET = process.env.ELECTRIC_SECRET ?? "local-dev-secret";
const TABLE = "sync_demo_items";
const LIVE_POLL_TIMEOUT_MS = 15_000;

function sql(query) {
  return execFileSync(
    "docker",
    ["exec", "site-sync-postgres-1", "psql", "-U", "postgres", "-d", "site", "-tAc", query],
    { encoding: "utf8" }
  ).trim();
}

function shapeUrl(params) {
  const url = new URL("/v1/shape", ELECTRIC_URL);
  url.searchParams.set("table", TABLE);
  url.searchParams.set("secret", ELECTRIC_SECRET);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function fetchShape(params) {
  const response = await fetch(shapeUrl(params));
  if (!response.ok) {
    throw new Error(
      `shape request failed: ${response.status} ${await response.text()}`
    );
  }
  return {
    handle: response.headers.get("electric-handle"),
    offset: response.headers.get("electric-offset"),
    messages: await response.json(),
  };
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// 1. Initial sync: the seeded rows must come back as inserts.
const initial = await fetchShape({ offset: "-1" });
const inserts = initial.messages.filter((m) => m.headers?.operation === "insert");
if (inserts.length < 2) {
  fail(`expected seeded rows in initial sync, got ${inserts.length} inserts`);
}
console.log(`✓ initial sync: ${inserts.length} rows (handle ${initial.handle})`);

// 2. Write through Postgres, inside a transaction that reports its txid the
//    same way the future mutate endpoint will (pg_current_xact_id()::xid).
const marker = `smoke-${Date.now()}`;
const txid = sql(
  `begin;
   insert into ${TABLE} (title) values ('${marker}');
   select pg_current_xact_id()::xid::text;
   commit;`
);
console.log(`✓ inserted '${marker}' in postgres tx ${txid}`);

// 3. Live mode: the change must arrive on the shape log, tagged with that txid.
const deadline = Date.now() + LIVE_POLL_TIMEOUT_MS;
let offset = initial.offset;
let found = false;
while (Date.now() < deadline && !found) {
  const live = await fetchShape({
    offset,
    handle: initial.handle,
    live: "true",
  });
  offset = live.offset ?? offset;
  found = live.messages.some(
    (m) =>
      m.headers?.operation === "insert" &&
      m.value?.title === marker &&
      (m.headers?.txids ?? []).map(String).includes(txid)
  );
}
if (!found) {
  fail(`live update with txid ${txid} did not arrive within ${LIVE_POLL_TIMEOUT_MS}ms`);
}
console.log(`✓ live update arrived with matching txid ${txid}`);
console.log("\nAll good: postgres → replication → electric → http is working.");
