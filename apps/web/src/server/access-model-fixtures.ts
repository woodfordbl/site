/**
 * @fileoverview Fixtures shared by the access-model integration suites
 * (`src/server/access-model.test.ts`, `src/server/workspace-scoped-ids.test.ts`),
 * which exercise the SQL permission model in `src/server/migrations/0003_rebac.sql`,
 * `0004_access_log.sql` and `0005_workspace_scoped_ids.sql` against a live
 * Postgres.
 *
 * Contracts this module upholds, because the suites run against a developer's
 * real database:
 *
 * - Every row a suite writes is addressed by an id derived from
 *   {@link fixturePrefix}, which carries a random component. Two suites — and
 *   two concurrent runs of the same suite — therefore never share an id, and
 *   nothing here needs to (or may) truncate a table or delete a row it did not
 *   create. {@link dropFixtures} removes exactly the named workspaces and
 *   users; everything else the suites write hangs off those by
 *   `on delete cascade`.
 * - The suites only run where a migrated database exists. {@link describeDb}
 *   is the gate: with no `DATABASE_URL` the suites skip, and with one they run
 *   for real — there is no silent pass.
 *
 * A failure in either suite means the SQL permission model no longer answers
 * as specified, which is a security regression rather than a test-only defect.
 */
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe } from "vitest";

/** Capability levels, ordered weakest first. */
export const ACCESS_LEVELS = [
  "view",
  "comment",
  "edit",
  "full_access",
] as const;

/** One capability level, matching the `level` check constraints in SQL. */
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * Ordering used by `page_level_rank` in SQL: no access ranks below `view`.
 * Mirrored here so the suites can derive the expected `can_access` answer from
 * an observed `effective_level` instead of trusting SQL to check itself.
 */
export function levelRank(level: AccessLevel | null): number {
  return level ? ACCESS_LEVELS.indexOf(level) + 1 : 0;
}

/**
 * Gate for suites that need a migrated Postgres: `describe` when
 * `DATABASE_URL` is set, `describe.skip` otherwise.
 */
export const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * An id stem unique to one suite in one run. The random half is what keeps
 * parallel test files and concurrent runs from writing each other's rows.
 */
export function fixturePrefix(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}`;
}

/** Inserts a fixture user; the email is derived from the id, so it is unique. */
export function insertUser(db: Pool, id: string): Promise<unknown> {
  return db.query('insert into "user" (id, name, email) values ($1, $2, $3)', [
    id,
    id,
    `${id}@access-model.test`,
  ]);
}

/** Inserts a fixture workspace, using the id as its slug. */
export function insertWorkspace(
  db: Pool,
  id: string,
  name: string
): Promise<unknown> {
  return db.query(
    'insert into "organization" (id, name, slug) values ($1, $2, $3)',
    [id, name, id]
  );
}

/** Joins a fixture user to a fixture workspace at the given Better Auth role. */
export function insertMember(
  db: Pool,
  membership: {
    id: string;
    workspaceId: string;
    userId: string;
    role: "owner" | "admin" | "member" | "guest";
  }
): Promise<unknown> {
  return db.query(
    'insert into "member" (id, "organizationId", "userId", role) values ($1, $2, $3, $4)',
    [membership.id, membership.workspaceId, membership.userId, membership.role]
  );
}

/**
 * Removes every fixture row of a suite: the named workspaces (pages, blocks,
 * databases, grants, closure, projection and groups cascade away with them),
 * the named users, and the shape-log entries the projection triggers wrote.
 * Only rows the suite created are named, so a developer's own data is never
 * touched — and the delete-by-id form makes the call safe to repeat.
 */
export async function dropFixtures(
  db: Pool,
  fixtures: { workspaces: string[]; users: string[] }
): Promise<void> {
  await db.query('delete from "organization" where id = any ($1)', [
    fixtures.workspaces,
  ]);
  await db.query('delete from "user" where id = any ($1)', [fixtures.users]);
  await db.query("delete from shape_log where workspace_id = any ($1)", [
    fixtures.workspaces,
  ]);
}
