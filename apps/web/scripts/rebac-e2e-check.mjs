/**
 * ReBAC end-to-end check against a running dev server (pnpm dev): creates an
 * owner and a second member over the Better Auth HTTP API, then proves the
 * enforcement + access-aware sync surface with real @electric-sql/client
 * streams: member create/edit passes, a view-only grantee gets 403 on edit,
 * a private page is invisible in the other user's snapshot, granting view
 * arrives as a live insert, revoking arrives as a live synthetic delete, and
 * the my_access shape streams the grant/revoke transitions. Workspace
 * membership for the second user is seeded directly in Postgres (the
 * invitation flow is a UI concern, not what this script verifies).
 * Usage: node scripts/rebac-e2e-check.mjs (dev server on BASE_URL or :3000).
 */
import { ShapeStream } from "@electric-sql/client";
import pg from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:5432/site";
const STAMP = Date.now();

let assertions = 0;
const pass = (label) => {
  assertions += 1;
  console.log(`✓ ${label}`);
};
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

async function json(response) {
  if (!response.ok) {
    throw new Error(`${response.url} -> ${response.status}`);
  }
  return await response.json();
}

/** Sign up a fresh user; returns their cookie, user id, and personal ws. */
async function signUp(name) {
  const email = `rebac-e2e-${name}-${STAMP}@example.com`;
  const response = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    // Better Auth rejects origin-less POSTs (CSRF); browsers always send one.
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ name, email, password: "password1234" }),
  });
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  await json(response);
  const session = await json(
    await fetch(`${BASE}/api/auth/get-session`, { headers: { cookie } })
  );
  return {
    cookie,
    userId: session.user.id,
    ws: session.session.activeOrganizationId,
  };
}

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

function openStream(table, ws, cookie) {
  const seen = [];
  const state = { seen, sawUpToDate: false };
  const stream = new ShapeStream({
    url: `${BASE}/api/sync/shape`,
    params: { table, ws },
    headers: { cookie },
  });
  stream.subscribe((messages) => {
    for (const message of messages) {
      if (message.headers.control === "up-to-date") {
        state.sawUpToDate = true;
      }
      if (message.key) {
        seen.push(message);
      }
    }
  });
  return state;
}

const mutate = (cookie, workspaceId, mutations) =>
  fetch(`${BASE}/api/sync/mutate`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ workspaceId, mutations }),
  });

const permissions = async (cookie, body) =>
  await json(
    await fetch(`${BASE}/api/pages/permissions`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    })
  );

const pageDoc = (id, title) => ({
  id,
  slug: `rebac-e2e-${id.slice(0, 8)}`,
  title,
  parentId: null,
  blockOrder: [],
  serverBaselineHash: null,
  createdAt: new Date(STAMP).toISOString(),
  updatedAt: new Date(STAMP).toISOString(),
});

// ── 0. The dev server must be up ────────────────────────────────────────────

try {
  await fetch(BASE, { signal: AbortSignal.timeout(5000) });
} catch {
  fail(`dev server is not responding at ${BASE} — start it with pnpm dev`);
}
pass(`dev server responding at ${BASE}`);

// ── 1. Two users, one workspace ─────────────────────────────────────────────

const owner = await signUp("owner");
const member = await signUp("member");
if (!owner.ws) {
  fail("owner session has no activeOrganizationId");
}
const db = new pg.Client({ connectionString: DATABASE_URL });
await db.connect();
await db.query(
  `insert into "member" ("id", "organizationId", "userId", "role")
   values ($1, $2, $3, 'member')`,
  [crypto.randomUUID(), owner.ws, member.userId]
);
pass(`owner ${owner.userId} + member ${member.userId} share ws ${owner.ws}`);

try {
  // ── (a) a member can create and edit a page ───────────────────────────────

  const memberPage = crypto.randomUUID();
  let response = await mutate(member.cookie, owner.ws, [
    {
      table: "pages",
      op: "insert",
      id: memberPage,
      doc: pageDoc(memberPage, "Member page"),
    },
  ]);
  await json(response);
  pass("(a) member created a page (baseline edit)");
  response = await mutate(member.cookie, owner.ws, [
    { table: "pages", op: "update", id: memberPage, doc: { title: "Edited" } },
  ]);
  await json(response);
  pass("(a) member edited the page");

  // ── owner's page goes private ─────────────────────────────────────────────

  const secretPage = crypto.randomUUID();
  await json(
    await mutate(owner.cookie, owner.ws, [
      {
        table: "pages",
        op: "insert",
        id: secretPage,
        doc: pageDoc(secretPage, "Secret"),
      },
    ])
  );
  await permissions(owner.cookie, {
    action: "setVisibility",
    pageId: secretPage,
    visibility: "private",
  });

  // ── (c) private page invisible in the member's snapshot ───────────────────

  const snapshotRows = await json(
    await fetch(`${BASE}/api/sync/shape?table=pages&ws=${owner.ws}&offset=-1`, {
      headers: { cookie: member.cookie },
    })
  );
  const snapshotIds = snapshotRows.filter((m) => m.key).map((m) => m.value.id);
  if (snapshotIds.includes(secretPage)) {
    fail("(c) private page leaked into the member's snapshot");
  }
  if (!snapshotIds.includes(memberPage)) {
    fail("(c) member's own page missing from their snapshot");
  }
  pass("(c) private page absent from member's pages snapshot");

  // ── (d)+(f) grant view → live insert on pages + my_access streams ─────────

  const pagesStream = openStream("pages", owner.ws, member.cookie);
  const accessStream = openStream("my_access", owner.ws, member.cookie);
  await deadline(
    () => pagesStream.sawUpToDate && accessStream.sawUpToDate,
    "initial up-to-date on member streams"
  );
  await permissions(owner.cookie, {
    action: "set",
    pageId: secretPage,
    subjectType: "user",
    subjectId: member.userId,
    level: "view",
  });
  await deadline(
    () =>
      pagesStream.seen.some(
        (m) => m.headers.operation === "insert" && m.value?.id === secretPage
      ),
    "(d) live insert of the granted page"
  );
  pass("(d) granting view surfaced the page as a live insert");
  await deadline(
    () =>
      accessStream.seen.some(
        (m) =>
          m.headers.operation === "insert" &&
          m.value?.pageId === secretPage &&
          m.value?.level === "view"
      ),
    "(f) my_access grant row"
  );
  pass("(f) my_access streamed the grant row");

  // ── (b) view-only grantee gets 403 on edit ────────────────────────────────

  response = await mutate(member.cookie, owner.ws, [
    { table: "pages", op: "update", id: secretPage, doc: { title: "Hack" } },
  ]);
  if (response.status !== 403) {
    fail(`(b) expected 403 on view-only edit, got ${response.status}`);
  }
  const denial = await response.json();
  if (
    denial.error !== "forbidden" ||
    denial.table !== "pages" ||
    denial.id !== secretPage
  ) {
    fail(`(b) unexpected 403 body ${JSON.stringify(denial)}`);
  }
  pass("(b) view-only member got 403 {error, table, id} on edit");

  // ── (e)+(f) revoke → live synthetic delete on pages + my_access ───────────

  await permissions(owner.cookie, {
    action: "remove",
    pageId: secretPage,
    subjectType: "user",
    subjectId: member.userId,
  });
  await deadline(
    () =>
      pagesStream.seen.some(
        (m) => m.headers.operation === "delete" && m.value?.id === secretPage
      ),
    "(e) live synthetic delete of the revoked page"
  );
  pass("(e) revoking emitted a live synthetic delete");
  await deadline(
    () =>
      accessStream.seen.some(
        (m) =>
          m.headers.operation === "delete" && m.value?.pageId === secretPage
      ),
    "(f) my_access revoke row"
  );
  pass("(f) my_access streamed the revoke row");
} finally {
  await db.end();
}

console.log(`\nAll good: ${assertions} ReBAC e2e assertions passed.`);
process.exit(0);
