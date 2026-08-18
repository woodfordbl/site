/**
 * @fileoverview Integration suite for the workspace-scoped content keys
 * declared in `src/server/schema.ts`, run against a live Postgres.
 *
 * Shipped page content (`content/pages/*.json`) carries FIXED ids — the home
 * page's id is literally `home`, and its blocks and databases carry hard-coded
 * uuids — and every signed-in workspace seeds its own overlay copy of that
 * content. The contract under test is therefore that a content id names a
 * document WITHIN a workspace and never across the installation:
 * `(workspace_id, id)` is the identity of a row, `id` alone identifies nothing,
 * and every permission function takes the workspace explicitly.
 *
 * While ids were globally unique only the first workspace that ever seeded
 * could own them; every later workspace's seed matched zero rows and was then
 * rejected with a 403, because `can_access` resolved the id to a page owned by
 * a stranger. This suite is the regression test for that bug: two unrelated
 * workspaces seed the same shipped ids and each must own an independent copy,
 * resolve access only for its own members, and stay unreachable from the other
 * workspace's writes, grants and deletions. A failure means one workspace's
 * data or grants can decide another workspace's answer.
 *
 * The stages share the two workspaces and run in declaration order: each nested
 * `describe` performs its transition in `beforeAll` and then asserts.
 *
 * Skipped when `DATABASE_URL` is unset.
 */
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  type AccessLevel,
  describeDb,
  dropFixtures,
  fixturePrefix,
  insertMember,
  insertUser,
  insertWorkspace,
} from "@/server/access-model-fixtures.ts";

const PREFIX = fixturePrefix("workspace-scoped-ids");

const WORKSPACES = { a: `${PREFIX}-ws-a`, b: `${PREFIX}-ws-b` } as const;
const OWNERS = { a: `${PREFIX}-ann`, b: `${PREFIX}-ben` } as const;

/**
 * The shipped ids, deliberately NOT derived from the fixture prefix: their
 * being fixed across every workspace is the property under test. Concurrent
 * runs still cannot collide, because the rows are keyed by
 * `(workspace_id, id)` and the workspace ids carry the prefix.
 */
const SHIPPED = {
  page: "home",
  block: "22222222-2222-4222-8222-222222222222",
  database: "33333333-3333-4333-8333-333333333333",
} as const;

type WorkspaceKey = keyof typeof WORKSPACES;

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ── fixture writes ──────────────────────────────────────────────────────────

/** Two owners, two workspaces, no relationship between them. */
async function seed(): Promise<void> {
  for (const key of Object.keys(WORKSPACES) as WorkspaceKey[]) {
    await insertUser(db, OWNERS[key]);
    await insertWorkspace(db, WORKSPACES[key], `Shipped ${key}`);
    await insertMember(db, {
      id: `${PREFIX}-m-${key}`,
      workspaceId: WORKSPACES[key],
      userId: OWNERS[key],
      role: "owner",
    });
  }
}

/**
 * Replays the client's workspace seed for the shipped ids, statement for
 * statement as `routes/api/sync/mutate.post.ts` writes them. Returns how many
 * of the three rows the workspace ended up owning — 3 when the seed landed, 0
 * for every workspace after the first while ids were globally unique.
 */
async function seedShippedContent(ws: string, title: string): Promise<number> {
  const page = await db.query(
    `insert into pages (id, workspace_id, doc) values ($1, $2, $3::jsonb)
     on conflict (workspace_id, id) do update set doc = excluded.doc`,
    [
      SHIPPED.page,
      ws,
      JSON.stringify({
        id: SHIPPED.page,
        title,
        parentId: null,
        blockOrder: [SHIPPED.block],
      }),
    ]
  );
  const block = await db.query(
    `insert into blocks (id, workspace_id, page_id, doc)
     values ($1, $2, $3, $4::jsonb)
     on conflict (workspace_id, id) do update set doc = excluded.doc`,
    [
      SHIPPED.block,
      ws,
      SHIPPED.page,
      JSON.stringify({ id: SHIPPED.block, pageId: SHIPPED.page, text: title }),
    ]
  );
  const database = await db.query(
    `insert into databases (id, workspace_id, doc) values ($1, $2, $3::jsonb)
     on conflict (workspace_id, id) do update set doc = excluded.doc`,
    [SHIPPED.database, ws, JSON.stringify({ id: SHIPPED.database, title })]
  );
  return (
    (page.rowCount ?? 0) + (block.rowCount ?? 0) + (database.rowCount ?? 0)
  );
}

// ── reads ───────────────────────────────────────────────────────────────────

/** Which of the two fixture workspaces own one shipped id, ws-ordered. */
async function ownersOf(
  table: "pages" | "blocks" | "databases",
  id: string
): Promise<string[]> {
  const { rows } = await db.query<{ workspaceId: string }>(
    `select workspace_id as "workspaceId" from ${table}
     where id = $1 and workspace_id = any ($2) order by workspace_id`,
    [id, [WORKSPACES.a, WORKSPACES.b]]
  );
  return rows.map((row) => row.workspaceId);
}

interface ShippedAccess {
  canViewA: boolean;
  canViewB: boolean;
  inA: AccessLevel | null;
  inB: AccessLevel | null;
}

/** One user's access to the same shipped page id in each workspace. */
async function accessToShippedPage(userId: string): Promise<ShippedAccess> {
  const { rows } = await db.query<ShippedAccess>(
    `select effective_level($1, $2, $4) as "inA",
            effective_level($1, $3, $4) as "inB",
            can_access($1, $2, $4, 'view') as "canViewA",
            can_access($1, $3, $4, 'view') as "canViewB"`,
    [userId, WORKSPACES.a, WORKSPACES.b, SHIPPED.page]
  );
  return rows[0];
}

/** The title each fixture workspace's copy of the shipped page carries. */
async function shippedTitles(): Promise<string[]> {
  const { rows } = await db.query<{ title: string }>(
    `select doc ->> 'title' as title from pages
     where id = $1 and workspace_id = any ($2) order by workspace_id`,
    [SHIPPED.page, [WORKSPACES.a, WORKSPACES.b]]
  );
  return rows.map((row) => row.title);
}

// ── the suite ───────────────────────────────────────────────────────────────

describeDb("workspace-scoped content ids", () => {
  beforeAll(async () => {
    await seed();
  });

  afterAll(async () => {
    await dropFixtures(db, {
      workspaces: [WORKSPACES.a, WORKSPACES.b],
      users: [OWNERS.a, OWNERS.b],
    });
    await db.end();
  });

  describe("seeding the same shipped ids into two workspaces", () => {
    const seeded = { a: 0, b: 0 };

    beforeAll(async () => {
      seeded.a = await seedShippedContent(WORKSPACES.a, "Home of A");
      seeded.b = await seedShippedContent(WORKSPACES.b, "Home of B");
    });

    it("writes all three shipped rows for the first workspace to seed", () => {
      expect(seeded.a).toBe(3);
    });

    it("writes the same three shipped ids again for a second, unrelated workspace", () => {
      expect(seeded.b).toBe(3);
    });

    it("keeps one copy of each shipped id per workspace", async () => {
      expect(await ownersOf("pages", SHIPPED.page)).toEqual([
        WORKSPACES.a,
        WORKSPACES.b,
      ]);
      expect(await ownersOf("blocks", SHIPPED.block)).toEqual([
        WORKSPACES.a,
        WORKSPACES.b,
      ]);
      expect(await ownersOf("databases", SHIPPED.database)).toEqual([
        WORKSPACES.a,
        WORKSPACES.b,
      ]);
    });

    it("keeps each workspace's copy of the document independent", async () => {
      expect(await shippedTitles()).toEqual(["Home of A", "Home of B"]);
    });
  });

  describe("resolving access to a shared shipped id", () => {
    it("resolves an owner's full_access only inside their own workspace", async () => {
      const ann = await accessToShippedPage(OWNERS.a);
      const ben = await accessToShippedPage(OWNERS.b);
      expect({ inA: ann.inA, inB: ann.inB }).toEqual({
        inA: "full_access",
        inB: null,
      });
      expect({ inA: ben.inA, inB: ben.inB }).toEqual({
        inA: null,
        inB: "full_access",
      });
    });

    it("denies each owner view on the other workspace's copy of the id", async () => {
      const ann = await accessToShippedPage(OWNERS.a);
      const ben = await accessToShippedPage(OWNERS.b);
      expect([ann.canViewA, ann.canViewB]).toEqual([true, false]);
      expect([ben.canViewA, ben.canViewB]).toEqual([false, true]);
    });

    it("pairs each owner with only their own workspace's copy in user_page_access", async () => {
      const { rows } = await db.query<{ userId: string; workspaceId: string }>(
        `select user_id as "userId", workspace_id as "workspaceId"
         from user_page_access
         where page_id = $1 and workspace_id = any ($2) order by user_id`,
        [SHIPPED.page, [WORKSPACES.a, WORKSPACES.b]]
      );
      expect(rows).toEqual([
        { userId: OWNERS.a, workspaceId: WORKSPACES.a },
        { userId: OWNERS.b, workspaceId: WORKSPACES.b },
      ]);
    });
  });

  describe("writing to one workspace's copy", () => {
    const edit = { rowCount: 0 };

    beforeAll(async () => {
      const result = await db.query(
        `update pages set doc = doc || '{"title":"B edited"}'::jsonb
         where workspace_id = $1 and id = $2`,
        [WORKSPACES.b, SHIPPED.page]
      );
      edit.rowCount = result.rowCount ?? 0;
    });

    it("touches exactly one row despite the id existing twice", () => {
      expect(edit.rowCount).toBe(1);
    });

    it("leaves the other workspace's copy of the id alone", async () => {
      expect(await shippedTitles()).toEqual(["Home of A", "B edited"]);
    });
  });

  describe("granting on one workspace's copy", () => {
    beforeAll(async () => {
      await db.query(
        `insert into page_permissions
           (workspace_id, page_id, subject_type, subject_id, level, granted_by)
         values ($1, $2, 'user', $3, 'view', $4)`,
        [WORKSPACES.b, SHIPPED.page, OWNERS.a, OWNERS.b]
      );
    });

    it("reaches only the granting workspace's copy of the id", async () => {
      const ann = await accessToShippedPage(OWNERS.a);
      expect({ inA: ann.inA, inB: ann.inB }).toEqual({
        inA: "full_access",
        inB: "view",
      });
    });

    it("leaves the other workspace's owner unaffected by the grant", async () => {
      const ben = await accessToShippedPage(OWNERS.b);
      expect(ben.inA).toBeNull();
    });
  });

  describe("deleting one of the two workspaces", () => {
    beforeAll(async () => {
      await db.query('delete from "organization" where id = $1', [
        WORKSPACES.b,
      ]);
    });

    it("cascades away only the deleted workspace's copy of the shipped id", async () => {
      expect(await ownersOf("pages", SHIPPED.page)).toEqual([WORKSPACES.a]);
    });

    it("cascades the deleted workspace's projection rows away with it", async () => {
      const { rows } = await db.query<{ n: number }>(
        "select count(*)::int as n from user_page_access where workspace_id = $1",
        [WORKSPACES.b]
      );
      expect(rows[0].n).toBe(0);
    });
  });
});
