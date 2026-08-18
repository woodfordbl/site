/**
 * @fileoverview ReBAC verification against the local dev database (pure SQL,
 * no HTTP): builds the architecture proposal's worked example — workspace
 * Acme with Alice (owner), Bob (member), Carol (guest), group Design={Bob},
 * page tree Wiki → Q3 Plan → Budget (restricted) plus Alice's private
 * Journal — then asserts the effective-permission truth table cell by cell
 * via can_access()/effective_level() and the materialized user_page_access
 * projection, and exercises revoke, move, un-restrict, and cycle rejection.
 * Fixed ids make the run idempotent: prior rows are deleted at start.
 * Usage: DATABASE_URL=postgres://… node scripts/rebac-check.mjs
 */
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:password@127.0.0.1:5432/site";

const WS = "rebac-check-ws";
const USERS = { alice: "rebac-alice", bob: "rebac-bob", carol: "rebac-carol" };
const GROUP_DESIGN = "11111111-1111-4111-8111-111111111111";
const PAGES = {
  wiki: "rebac-wiki",
  q3: "rebac-q3",
  budget: "rebac-budget",
  journal: "rebac-journal",
};
const LEVELS = ["view", "comment", "edit", "full_access"];
const CYCLE_RE = /cycle/;

const rank = (level) => (level ? LEVELS.indexOf(level) + 1 : 0);

let failures = 0;
const report = (label, ok, detail = "") => {
  console.log(
    `${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`
  );
  if (!ok) {
    failures += 1;
  }
};

const client = new pg.Client({ connectionString: DATABASE_URL });

async function cleanup() {
  await client.query('delete from "organization" where id = $1', [WS]);
  await client.query('delete from "user" where id = any ($1)', [
    Object.values(USERS),
  ]);
  await client.query("delete from shape_log where workspace_id = $1", [WS]);
}

const insertPage = ({ id, title, parentId = null, visibility, inherit }) =>
  client.query(
    `insert into pages (id, workspace_id, doc, visibility, inherit_permissions)
     values ($1, $2, $3::jsonb, $4, $5)`,
    [
      id,
      WS,
      JSON.stringify({ id, title, parentId, blockOrder: [] }),
      visibility ?? "workspace",
      inherit ?? true,
    ]
  );

const grant = (pageId, subjectType, subjectId, level) =>
  client.query(
    `insert into page_permissions (page_id, subject_type, subject_id, level, granted_by)
     values ($1, $2, $3, $4, $5)`,
    [pageId, subjectType, subjectId, level, USERS.alice]
  );

async function seed() {
  for (const [name, id] of Object.entries(USERS)) {
    await client.query(
      'insert into "user" (id, name, email) values ($1, $2, $3)',
      [id, name, `${id}@rebac-check.test`]
    );
  }
  await client.query(
    'insert into "organization" (id, name, slug) values ($1, $2, $3)',
    [WS, "Acme", "rebac-check"]
  );
  const roles = { alice: "owner", bob: "member", carol: "guest" };
  for (const [name, role] of Object.entries(roles)) {
    await client.query(
      'insert into "member" (id, "organizationId", "userId", role) values ($1, $2, $3, $4)',
      [`rebac-m-${name}`, WS, USERS[name], role]
    );
  }
  await client.query(
    "insert into groups (id, workspace_id, name) values ($1, $2, $3)",
    [GROUP_DESIGN, WS, "Design"]
  );
  await client.query(
    "insert into group_members (group_id, user_id) values ($1, $2)",
    [GROUP_DESIGN, USERS.bob]
  );

  await insertPage({ id: PAGES.wiki, title: "Wiki" });
  await insertPage({ id: PAGES.q3, title: "Q3 Plan", parentId: PAGES.wiki });
  await insertPage({
    id: PAGES.budget,
    title: "Budget",
    parentId: PAGES.q3,
    inherit: false, // "Restricted": severs everything above
  });
  await insertPage({
    id: PAGES.journal,
    title: "Journal",
    visibility: "private",
  });

  // Alice's automatic full_access on her private page.
  await grant(PAGES.journal, "user", USERS.alice, "full_access");
  // Carol the guest is shared into Q3 Plan read-only.
  await grant(PAGES.q3, "user", USERS.carol, "view");
  // Grants copied onto Budget at the moment of restriction.
  await grant(PAGES.budget, "user", USERS.alice, "full_access");
  await grant(PAGES.budget, "group", GROUP_DESIGN, "view");
}

/** One row per (user, page): effective level + can_access at all four levels. */
async function fetchGrid() {
  const { rows } = await client.query(
    `select u.uid, p.pid,
            effective_level(u.uid, p.pid) as lvl,
            can_access(u.uid, p.pid, 'view') as can_view,
            can_access(u.uid, p.pid, 'comment') as can_comment,
            can_access(u.uid, p.pid, 'edit') as can_edit,
            can_access(u.uid, p.pid, 'full_access') as can_full_access
     from unnest($1::text[]) as u (uid)
     cross join unnest($2::text[]) as p (pid)`,
    [Object.values(USERS), Object.values(PAGES)]
  );
  const grid = new Map();
  for (const row of rows) {
    grid.set(`${row.uid}:${row.pid}`, row);
  }
  return grid;
}

/** Asserts effective_level + all four can_access cells per (user, page). */
function assertTruth(stage, grid, truth) {
  for (const [pid, byUser] of Object.entries(truth)) {
    for (const [user, expected] of Object.entries(byUser)) {
      const row = grid.get(`${USERS[user]}:${pid}`);
      report(
        `${stage}: effective(${user}, ${pid}) = ${expected}`,
        row.lvl === expected,
        `got ${row.lvl}`
      );
      for (const level of LEVELS) {
        const want = rank(expected) >= rank(level);
        report(
          `${stage}: can_access(${user}, ${pid}, ${level}) = ${want}`,
          row[`can_${level}`] === want,
          `got ${row[`can_${level}`]}`
        );
      }
    }
  }
}

async function fetchAccessRows() {
  const { rows } = await client.query(
    `select user_id, page_id, level from user_page_access
     where workspace_id = $1 order by user_id, page_id`,
    [WS]
  );
  return rows.map((r) => `${r.user_id} ${r.page_id} ${r.level}`);
}

async function assertSnapshot(stage, expected) {
  const actual = await fetchAccessRows();
  const want = [...expected].sort();
  const ok =
    actual.length === want.length && actual.every((v, i) => v === want[i]);
  report(
    `${stage}: user_page_access snapshot (${want.length} rows)`,
    ok,
    `expected ${JSON.stringify(want)} got ${JSON.stringify(actual)}`
  );
}

async function fetchAncestors(pageId) {
  const { rows } = await client.query(
    "select ancestor_id, depth from page_ancestors where page_id = $1 order by depth",
    [pageId]
  );
  return rows.map((r) => `${r.ancestor_id}:${r.depth}`);
}

async function assertAncestors(stage, pageId, expected) {
  const actual = await fetchAncestors(pageId);
  report(
    `${stage}: ancestors(${pageId}) = ${expected.join(", ")}`,
    JSON.stringify(actual) === JSON.stringify(expected),
    `got ${actual.join(", ")}`
  );
}

const movePage = (pageId, newParentId) =>
  client.query(
    `update pages set doc = jsonb_set(doc, '{parentId}', to_jsonb($1::text))
     where id = $2`,
    [newParentId, pageId]
  );

// ── stage 1: the §3/§4 worked-example truth table ───────────────────────────

await client.connect();
try {
  await cleanup();
  await seed();
  console.log(`seeded workspace ${WS} (Acme worked example)\n`);

  assertTruth("truth", await fetchGrid(), {
    [PAGES.wiki]: { alice: "full_access", bob: "edit", carol: null },
    [PAGES.q3]: { alice: "full_access", bob: "edit", carol: "view" },
    [PAGES.budget]: { alice: "full_access", bob: "view", carol: null },
    [PAGES.journal]: { alice: "full_access", bob: null, carol: null },
  });
  await assertSnapshot("truth", [
    `${USERS.alice} ${PAGES.wiki} full_access`,
    `${USERS.alice} ${PAGES.q3} full_access`,
    `${USERS.alice} ${PAGES.budget} full_access`,
    `${USERS.alice} ${PAGES.journal} full_access`,
    `${USERS.bob} ${PAGES.wiki} edit`,
    `${USERS.bob} ${PAGES.q3} edit`,
    `${USERS.bob} ${PAGES.budget} view`,
    `${USERS.carol} ${PAGES.q3} view`,
  ]);

  // ── stage 2: revoke Carol → her projection rows vanish ────────────────────

  console.log("\nrevoking Carol's grant on Q3 Plan");
  await client.query(
    "delete from page_permissions where page_id = $1 and subject_type = 'user' and subject_id = $2",
    [PAGES.q3, USERS.carol]
  );
  assertTruth("revoke", await fetchGrid(), {
    [PAGES.q3]: { carol: null },
  });
  const carolRows = (await fetchAccessRows()).filter((row) =>
    row.startsWith(USERS.carol)
  );
  report(
    "revoke: Carol has zero user_page_access rows",
    carolRows.length === 0
  );

  // ── stage 3: move Q3 Plan under Journal → access re-derives ───────────────

  console.log("\nmoving Q3 Plan under Journal");
  await movePage(PAGES.q3, PAGES.journal);
  await assertAncestors("move", PAGES.q3, [
    `${PAGES.q3}:0`,
    `${PAGES.journal}:1`,
  ]);
  await assertAncestors("move", PAGES.budget, [
    `${PAGES.budget}:0`,
    `${PAGES.q3}:1`,
    `${PAGES.journal}:2`,
  ]);
  // A fresh grant on Journal must now flow down the new chain to Q3 Plan,
  // but stop at the still-restricted Budget.
  await grant(PAGES.journal, "user", USERS.carol, "view");
  assertTruth("move", await fetchGrid(), {
    [PAGES.journal]: { carol: "view" },
    [PAGES.q3]: { alice: "full_access", bob: "edit", carol: "view" },
    [PAGES.budget]: { bob: "view", carol: null },
  });

  // ── stage 4: un-restrict Budget → inheritance returns ─────────────────────

  console.log("\nun-restricting Budget");
  await client.query(
    "update pages set inherit_permissions = true where id = $1",
    [PAGES.budget]
  );
  assertTruth("unrestrict", await fetchGrid(), {
    [PAGES.wiki]: { alice: "full_access", bob: "edit", carol: null },
    [PAGES.q3]: { alice: "full_access", bob: "edit", carol: "view" },
    [PAGES.budget]: { alice: "full_access", bob: "edit", carol: "view" },
    [PAGES.journal]: { alice: "full_access", bob: null, carol: "view" },
  });
  await assertSnapshot("unrestrict", [
    `${USERS.alice} ${PAGES.wiki} full_access`,
    `${USERS.alice} ${PAGES.q3} full_access`,
    `${USERS.alice} ${PAGES.budget} full_access`,
    `${USERS.alice} ${PAGES.journal} full_access`,
    `${USERS.bob} ${PAGES.wiki} edit`,
    `${USERS.bob} ${PAGES.q3} edit`,
    `${USERS.bob} ${PAGES.budget} edit`,
    `${USERS.carol} ${PAGES.journal} view`,
    `${USERS.carol} ${PAGES.q3} view`,
    `${USERS.carol} ${PAGES.budget} view`,
  ]);

  // ── stage 5: a move creating a cycle must be rejected ─────────────────────

  console.log("\nattempting cycle: Journal under Budget");
  let cycleError = null;
  try {
    await movePage(PAGES.journal, PAGES.budget);
  } catch (error) {
    cycleError = error;
  }
  report(
    "cycle: move rejected with an exception",
    cycleError !== null && CYCLE_RE.test(String(cycleError?.message)),
    String(cycleError?.message ?? "no error raised")
  );
  const { rows: journalRows } = await client.query(
    "select parent_id from pages where id = $1",
    [PAGES.journal]
  );
  report(
    "cycle: Journal's parent unchanged (statement rolled back)",
    journalRows[0].parent_id === null,
    `parent_id = ${journalRows[0].parent_id}`
  );
  await assertAncestors("cycle", PAGES.journal, [`${PAGES.journal}:0`]);
} finally {
  await client.end();
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll ReBAC assertions passed.");
process.exit(0);
