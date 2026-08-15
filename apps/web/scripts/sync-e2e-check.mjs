/**
 * End-to-end sync check against a running dev server (pnpm dev):
 * signs in, opens a real @electric-sql/client ShapeStream on the pages shape,
 * writes through /api/sync/mutate, and verifies the change comes back on the
 * live stream carrying the returned txid. This exercises the exact code path
 * the app's TanStack DB collections use.
 */
import { ShapeStream } from "@electric-sql/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = `e2e-${Date.now()}@example.com`;

async function json(response) {
  if (!response.ok) {
    throw new Error(`${response.url} -> ${response.status}`);
  }
  return await response.json();
}

// 1. Create an account (auto-creates a personal workspace).
const signUp = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: "POST",
  // Better Auth rejects origin-less POSTs (CSRF); browsers always send one.
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({
    name: "E2E Check",
    email: EMAIL,
    password: "password1234",
  }),
});
const cookie = signUp.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
await json(signUp);

// 2. Resolve the active workspace from the session.
const session = await json(
  await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie } })
);
const ws = session.session.activeOrganizationId;
if (!ws) {
  throw new Error("session has no activeOrganizationId");
}
console.log(`✓ signed up ${EMAIL}, workspace ${ws}`);

// 3. Open the pages shape with the real Electric client.
const seen = [];
const stream = new ShapeStream({
  url: `${BASE}/api/sync/shape`,
  params: { table: "pages", ws },
  headers: { cookie },
});
let sawUpToDate = false;
stream.subscribe((messages) => {
  for (const message of messages) {
    if (message.headers.control === "up-to-date") {
      sawUpToDate = true;
    }
    if (message.key) {
      seen.push(message);
    }
  }
});

const deadline = (predicate, label, ms = 8000) =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) {
        return resolve(undefined);
      }
      if (Date.now() - started > ms) {
        return reject(new Error(`timeout waiting for ${label}`));
      }
      setTimeout(tick, 50);
    };
    tick();
  });

await deadline(() => sawUpToDate, "initial up-to-date");
console.log(`✓ initial sync complete (${seen.length} rows), stream is live`);

// 4. Write a page through the mutate endpoint.
const pageId = crypto.randomUUID();
const now = new Date().toISOString();
const doc = {
  id: pageId,
  slug: `e2e-${pageId.slice(0, 8)}`,
  title: "E2E page",
  parentId: null,
  blockOrder: [],
  serverBaselineHash: null,
  createdAt: now,
  updatedAt: now,
};
const { txid } = await json(
  await fetch(`${BASE}/api/sync/mutate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      workspaceId: ws,
      mutations: [{ table: "pages", op: "insert", id: pageId, doc }],
    }),
  })
);
console.log(`✓ mutate committed with txid ${txid} (${typeof txid})`);

// 5. The insert must arrive on the live stream tagged with that txid.
await deadline(
  () =>
    seen.some(
      (m) =>
        m.headers.operation === "insert" &&
        m.value?.id === pageId &&
        (m.headers.txids ?? []).includes(txid)
    ),
  `live insert with txid ${txid}`
);
console.log("✓ live insert arrived with matching txid");

// 6. Update + delete round-trip.
const updateResult = await json(
  await fetch(`${BASE}/api/sync/mutate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      workspaceId: ws,
      mutations: [
        { table: "pages", op: "update", id: pageId, doc: { title: "Renamed" } },
      ],
    }),
  })
);
await deadline(
  () =>
    seen.some(
      (m) =>
        m.headers.operation === "update" &&
        m.value?.id === pageId &&
        m.value?.title === "Renamed" &&
        m.value?.slug === doc.slug &&
        (m.headers.txids ?? []).includes(updateResult.txid)
    ),
  "live update (merged doc)"
);
console.log("✓ per-key patch update arrived (title changed, slug preserved)");

const deleteResult = await json(
  await fetch(`${BASE}/api/sync/mutate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      workspaceId: ws,
      mutations: [{ table: "pages", op: "delete", id: pageId }],
    }),
  })
);
await deadline(
  () =>
    seen.some(
      (m) =>
        m.headers.operation === "delete" &&
        m.value?.id === pageId &&
        (m.headers.txids ?? []).includes(deleteResult.txid)
    ),
  "live delete"
);
console.log("✓ live delete arrived with PK value");

console.log("\nAll good: auth → shape snapshot → live stream → txid ack.");
process.exit(0);
