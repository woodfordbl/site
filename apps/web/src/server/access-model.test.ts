/**
 * @fileoverview Integration suite for the page access model — the tables in
 * `src/server/schema.ts` and the functions and triggers in
 * `src/server/migrations/0001_functions_and_triggers.sql` — run against a live
 * Postgres: the
 * `effective_level`/`can_access` pair, workspace-role baselines, explicit user
 * and group grants, inheritance down the page tree, truncation at a restricted
 * page, private visibility, the trigger-maintained `page_ancestors` closure and
 * `user_page_access` projection, subtree moves, and cycle rejection.
 *
 * The suite builds the architecture proposal's worked example — workspace Acme
 * with Alice (owner), Bob (member), Carol (guest), a Design group holding Bob,
 * and the tree Wiki → Q3 Plan → Budget (restricted) beside Alice's private
 * Journal — then walks it through a revoke, a subtree move, an un-restrict and
 * a rejected cycle, re-deriving the whole truth table after each transition.
 * The stages share one workspace and run in declaration order: each nested
 * `describe` performs its transition in `beforeAll` and then asserts.
 *
 * A failure names the permission rule that broke. Because the model is enforced
 * in SQL rather than in application code, that is a security regression.
 *
 * Skipped when `DATABASE_URL` is unset. Cross-workspace id scoping is covered
 * by `src/server/workspace-scoped-ids.test.ts`.
 */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ACCESS_LEVELS,
  type AccessLevel,
  describeDb,
  dropFixtures,
  fixturePrefix,
  insertMember,
  insertUser,
  insertWorkspace,
  levelRank,
} from "@/server/access-model-fixtures.ts";

const PREFIX = fixturePrefix("access-model");
const WORKSPACE = `${PREFIX}-ws`;
const DESIGN_GROUP = randomUUID();

const USERS = {
  alice: `${PREFIX}-alice`,
  bob: `${PREFIX}-bob`,
  carol: `${PREFIX}-carol`,
} as const;

const PAGES = {
  wiki: `${PREFIX}-wiki`,
  q3: `${PREFIX}-q3`,
  budget: `${PREFIX}-budget`,
  journal: `${PREFIX}-journal`,
} as const;

type UserKey = keyof typeof USERS;
type PageKey = keyof typeof PAGES;

/** The wording `rebac_rebuild_ancestors` raises when a move closes a loop. */
const CYCLE_MESSAGE = /cycle/;

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── fixture writes ──────────────────────────────────────────────────────────

function insertPage(page: {
  id: string;
  title: string;
  parentId?: string;
  visibility?: "workspace" | "private";
  inherit?: boolean;
}): Promise<unknown> {
  return db.query(
    `insert into pages (id, workspace_id, doc, visibility, inherit_permissions)
     values ($1, $2, $3::jsonb, $4, $5)`,
    [
      page.id,
      WORKSPACE,
      JSON.stringify({
        id: page.id,
        title: page.title,
        parentId: page.parentId ?? null,
        blockOrder: [],
      }),
      page.visibility ?? "workspace",
      page.inherit ?? true,
    ]
  );
}

function grant(
  pageId: string,
  subjectType: "user" | "group",
  subjectId: string,
  level: AccessLevel
): Promise<unknown> {
  return db.query(
    `insert into page_permissions
       (workspace_id, page_id, subject_type, subject_id, level, granted_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [WORKSPACE, pageId, subjectType, subjectId, level, USERS.alice]
  );
}

/** Repoints a page's `doc.parentId`, which the generated `parent_id` follows. */
function movePage(pageId: string, newParentId: string): Promise<unknown> {
  return db.query(
    `update pages set doc = jsonb_set(doc, '{parentId}', to_jsonb($1::text))
     where workspace_id = $2 and id = $3`,
    [newParentId, WORKSPACE, pageId]
  );
}

async function seed(): Promise<void> {
  for (const id of Object.values(USERS)) {
    await insertUser(db, id);
  }
  await insertWorkspace(db, WORKSPACE, "Acme");
  const roles = { alice: "owner", bob: "member", carol: "guest" } as const;
  for (const [name, role] of Object.entries(roles)) {
    await insertMember(db, {
      id: `${PREFIX}-m-${name}`,
      workspaceId: WORKSPACE,
      userId: USERS[name as UserKey],
      role,
    });
  }
  await db.query(
    "insert into groups (id, workspace_id, name) values ($1, $2, $3)",
    [DESIGN_GROUP, WORKSPACE, "Design"]
  );
  await db.query(
    "insert into group_members (group_id, user_id) values ($1, $2)",
    [DESIGN_GROUP, USERS.bob]
  );

  await insertPage({ id: PAGES.wiki, title: "Wiki" });
  await insertPage({ id: PAGES.q3, title: "Q3 Plan", parentId: PAGES.wiki });
  // "Restricted": inherit_permissions=false severs everything above.
  await insertPage({
    id: PAGES.budget,
    title: "Budget",
    parentId: PAGES.q3,
    inherit: false,
  });
  await insertPage({
    id: PAGES.journal,
    title: "Journal",
    visibility: "private",
  });

  // Alice's automatic full_access on her own private page.
  await grant(PAGES.journal, "user", USERS.alice, "full_access");
  // Carol the guest is shared into Q3 Plan read-only.
  await grant(PAGES.q3, "user", USERS.carol, "view");
  // The grants copied onto Budget at the moment of restriction.
  await grant(PAGES.budget, "user", USERS.alice, "full_access");
  await grant(PAGES.budget, "group", DESIGN_GROUP, "view");
}

// ── reads ───────────────────────────────────────────────────────────────────

interface GridCell {
  allowed: boolean;
  effective: AccessLevel | null;
  level: AccessLevel;
  pageId: string;
  userId: string;
}

/** Effective level per (user, page) plus the `can_access` answer per level. */
interface Grid {
  cells: GridCell[];
  effective: Map<string, AccessLevel | null>;
}

const cellKey = (userId: string, pageId: string) => `${userId}:${pageId}`;

async function readGrid(): Promise<Grid> {
  const { rows } = await db.query<GridCell>(
    `select u.uid as "userId", p.pid as "pageId", l.lvl as "level",
            effective_level(u.uid, $4, p.pid) as "effective",
            can_access(u.uid, $4, p.pid, l.lvl) as "allowed"
     from unnest($1::text[]) as u (uid)
     cross join unnest($2::text[]) as p (pid)
     cross join unnest($3::text[]) as l (lvl)`,
    [Object.values(USERS), Object.values(PAGES), [...ACCESS_LEVELS], WORKSPACE]
  );
  const expected =
    Object.keys(USERS).length *
    Object.keys(PAGES).length *
    ACCESS_LEVELS.length;
  if (rows.length !== expected) {
    throw new Error(`grid returned ${rows.length} rows, expected ${expected}`);
  }
  const effective = new Map<string, AccessLevel | null>();
  for (const cell of rows) {
    effective.set(cellKey(cell.userId, cell.pageId), cell.effective);
  }
  return { cells: rows, effective };
}

/** One user's effective level on each of the four fixture pages. */
function levelsFor(
  grid: Grid,
  user: UserKey
): Record<PageKey, AccessLevel | null> {
  const read = (page: PageKey) =>
    grid.effective.get(cellKey(USERS[user], PAGES[page])) ?? null;
  return {
    wiki: read("wiki"),
    q3: read("q3"),
    budget: read("budget"),
    journal: read("journal"),
  };
}

/**
 * The `can_access` answers Postgres reported, beside the answers its own
 * `effective_level` implies, keyed identically so a mismatch names the cell.
 */
function canAccessAgreement(grid: Grid): {
  reported: Record<string, boolean>;
  implied: Record<string, boolean>;
} {
  const reported: Record<string, boolean> = {};
  const implied: Record<string, boolean> = {};
  for (const cell of grid.cells) {
    const key = `${cell.userId}:${cell.pageId}:${cell.level}`;
    reported[key] = cell.allowed;
    implied[key] = levelRank(cell.effective) >= levelRank(cell.level);
  }
  return { reported, implied };
}

/** The workspace's `user_page_access` rows as sorted `"user page level"`. */
async function readProjection(): Promise<string[]> {
  const { rows } = await db.query<{
    userId: string;
    pageId: string;
    level: AccessLevel;
  }>(
    `select user_id as "userId", page_id as "pageId", level
     from user_page_access where workspace_id = $1`,
    [WORKSPACE]
  );
  return rows.map((row) => `${row.userId} ${row.pageId} ${row.level}`).sort();
}

const projected = (user: UserKey, page: PageKey, level: AccessLevel) =>
  `${USERS[user]} ${PAGES[page]} ${level}`;

/** A page's closure chain as `"ancestorId:depth"`, nearest ancestor first. */
async function readAncestors(pageId: string): Promise<string[]> {
  const { rows } = await db.query<{ ancestorId: string; depth: number }>(
    `select ancestor_id as "ancestorId", depth from page_ancestors
     where workspace_id = $1 and page_id = $2 order by depth`,
    [WORKSPACE, pageId]
  );
  return rows.map((row) => `${row.ancestorId}:${row.depth}`);
}

// ── the suite ───────────────────────────────────────────────────────────────

describeDb("page access model", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await dropFixtures(db, {
      workspaces: [WORKSPACE],
      users: Object.values(USERS),
    });
    await db.end();
  });

  describe("the seeded worked example", () => {
    let grid: Grid;

    beforeAll(async () => {
      grid = await readGrid();
    });

    it("gives the workspace owner full_access on every page, restricted and private included", () => {
      expect(levelsFor(grid, "alice")).toEqual({
        wiki: "full_access",
        q3: "full_access",
        budget: "full_access",
        journal: "full_access",
      });
    });

    it("gives a member the edit baseline on workspace-visible pages", () => {
      expect(levelsFor(grid, "bob").wiki).toBe("edit");
      expect(levelsFor(grid, "bob").q3).toBe("edit");
    });

    it("keeps a private page out of a member's reach", () => {
      expect(levelsFor(grid, "bob").journal).toBeNull();
    });

    it("gives a guest nothing beyond the page shared with them", () => {
      expect(levelsFor(grid, "carol")).toEqual({
        wiki: null,
        q3: "view",
        budget: null,
        journal: null,
      });
    });

    it("stops inherited grants at a restricted page, leaving only what is granted there", () => {
      expect(levelsFor(grid, "bob").budget).toBe("view");
      expect(levelsFor(grid, "carol").budget).toBeNull();
    });

    it("answers can_access exactly as effective_level implies at every level", () => {
      const { reported, implied } = canAccessAgreement(grid);
      expect(reported).toEqual(implied);
    });

    it("projects one user_page_access row per reachable (user, page) pair", async () => {
      expect(await readProjection()).toEqual(
        [
          projected("alice", "wiki", "full_access"),
          projected("alice", "q3", "full_access"),
          projected("alice", "budget", "full_access"),
          projected("alice", "journal", "full_access"),
          projected("bob", "wiki", "edit"),
          projected("bob", "q3", "edit"),
          projected("bob", "budget", "view"),
          projected("carol", "q3", "view"),
        ].sort()
      );
    });
  });

  describe("revoking an explicit grant", () => {
    let grid: Grid;

    beforeAll(async () => {
      await db.query(
        `delete from page_permissions where workspace_id = $1 and page_id = $2
           and subject_type = 'user' and subject_id = $3`,
        [WORKSPACE, PAGES.q3, USERS.carol]
      );
      grid = await readGrid();
    });

    it("drops the revoked subject's effective level back to none", () => {
      expect(levelsFor(grid, "carol").q3).toBeNull();
    });

    it("removes the revoked subject's rows from the user_page_access projection", async () => {
      const rows = await readProjection();
      expect(rows.filter((row) => row.startsWith(USERS.carol))).toEqual([]);
    });

    it("answers can_access exactly as effective_level implies at every level", () => {
      const { reported, implied } = canAccessAgreement(grid);
      expect(reported).toEqual(implied);
    });
  });

  describe("moving a subtree under a new parent", () => {
    let grid: Grid;

    beforeAll(async () => {
      await movePage(PAGES.q3, PAGES.journal);
      await grant(PAGES.journal, "user", USERS.carol, "view");
      grid = await readGrid();
    });

    it("rewrites the moved page's ancestor chain to the new parent", async () => {
      expect(await readAncestors(PAGES.q3)).toEqual([
        `${PAGES.q3}:0`,
        `${PAGES.journal}:1`,
      ]);
    });

    it("deepens every descendant's chain by the same move", async () => {
      expect(await readAncestors(PAGES.budget)).toEqual([
        `${PAGES.budget}:0`,
        `${PAGES.q3}:1`,
        `${PAGES.journal}:2`,
      ]);
    });

    it("flows a grant on the new parent down to the moved page", () => {
      expect(levelsFor(grid, "carol").journal).toBe("view");
      expect(levelsFor(grid, "carol").q3).toBe("view");
    });

    it("keeps the workspace baselines on the moved page", () => {
      expect(levelsFor(grid, "alice").q3).toBe("full_access");
      expect(levelsFor(grid, "bob").q3).toBe("edit");
    });

    it("still stops the newly inherited grant at the restricted page", () => {
      expect(levelsFor(grid, "carol").budget).toBeNull();
      expect(levelsFor(grid, "bob").budget).toBe("view");
    });

    it("answers can_access exactly as effective_level implies at every level", () => {
      const { reported, implied } = canAccessAgreement(grid);
      expect(reported).toEqual(implied);
    });
  });

  describe("un-restricting a page", () => {
    let grid: Grid;

    beforeAll(async () => {
      await db.query(
        `update pages set inherit_permissions = true
         where workspace_id = $1 and id = $2`,
        [WORKSPACE, PAGES.budget]
      );
      grid = await readGrid();
    });

    it("restores inheritance from the whole ancestor chain", () => {
      expect(levelsFor(grid, "alice")).toEqual({
        wiki: "full_access",
        q3: "full_access",
        budget: "full_access",
        journal: "full_access",
      });
      expect(levelsFor(grid, "bob")).toEqual({
        wiki: "edit",
        q3: "edit",
        budget: "edit",
        journal: null,
      });
      expect(levelsFor(grid, "carol")).toEqual({
        wiki: null,
        q3: "view",
        budget: "view",
        journal: "view",
      });
    });

    it("answers can_access exactly as effective_level implies at every level", () => {
      const { reported, implied } = canAccessAgreement(grid);
      expect(reported).toEqual(implied);
    });

    it("adds the newly reachable pairs to the user_page_access projection", async () => {
      expect(await readProjection()).toEqual(
        [
          projected("alice", "wiki", "full_access"),
          projected("alice", "q3", "full_access"),
          projected("alice", "budget", "full_access"),
          projected("alice", "journal", "full_access"),
          projected("bob", "wiki", "edit"),
          projected("bob", "q3", "edit"),
          projected("bob", "budget", "edit"),
          projected("carol", "journal", "view"),
          projected("carol", "q3", "view"),
          projected("carol", "budget", "view"),
        ].sort()
      );
    });
  });

  describe("a move that would create a cycle", () => {
    const attempt = { message: "" };

    beforeAll(async () => {
      try {
        await movePage(PAGES.journal, PAGES.budget);
      } catch (error) {
        attempt.message =
          error instanceof Error ? error.message : String(error);
      }
    });

    it("is rejected with a cycle error instead of corrupting the closure", () => {
      expect(attempt.message).toMatch(CYCLE_MESSAGE);
    });

    it("leaves the page's parent unchanged, the statement rolled back", async () => {
      const { rows } = await db.query<{ parentId: string | null }>(
        `select parent_id as "parentId" from pages
         where workspace_id = $1 and id = $2`,
        [WORKSPACE, PAGES.journal]
      );
      expect(rows[0].parentId).toBeNull();
    });

    it("leaves the page's ancestor chain unchanged", async () => {
      expect(await readAncestors(PAGES.journal)).toEqual([
        `${PAGES.journal}:0`,
      ]);
    });
  });
});
