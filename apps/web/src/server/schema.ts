/**
 * @fileoverview Drizzle definitions for every table in the application
 * database — the single source of truth for the schema. `drizzle-kit generate`
 * derives the baseline migration from this file plus `auth-schema.ts`; the
 * functions and triggers Drizzle cannot express live in the hand-written
 * migration that follows it (`src/server/migrations/`).
 *
 * Invariants encoded here:
 * - Content identity is `(workspace_id, id)`, never `id` alone. Shipped
 *   content carries fixed ids (the home page's id is literally `home`) and
 *   every workspace seeds its own overlay copy, so one id names a different
 *   document in each workspace. `id` is `text`, not `uuid`, for the same
 *   reason. Everything that references a page — grants, closure, projection —
 *   keys and foreign-keys on the composite pair, so no row can describe a page
 *   in another workspace.
 * - `doc` mirrors the client-side zod document verbatim (`localPageSchema`,
 *   `localBlockSchema`, `localDatabaseSchema`, `localDatabaseRowSchema`), so
 *   the TanStack DB collections sync whole documents with no mapping layer.
 *   The `$type<…>()` annotations are what make that contract checkable.
 * - `ON DELETE CASCADE` is load-bearing, not hygiene: deleting a workspace
 *   clears its pages and everything derived from them, deleting a page clears
 *   its grants/closure/projection rows, and deleting a user clears their
 *   grants and projection rows. `src/server/access-model.test.ts` asserts it.
 * - `pages.parent_id` is a stored generated column over `doc->>'parentId'` —
 *   the client document owns the field, and the closure triggers read the
 *   column. Generated columns cannot appear in `UPDATE OF` trigger lists,
 *   which is why the pages triggers fire on every UPDATE.
 * - Constraint and index names are pinned to the names Postgres assigned under
 *   the hand-written DDL this file replaces, so the generated schema is
 *   byte-identical to it.
 *
 * Better Auth's own tables are in `src/server/auth-schema.ts`; they are a
 * separate concern with a separate naming convention (quoted camelCase).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import type { MyAccessRow } from "@/lib/schemas/page-access.ts";
import { organization, user } from "@/server/auth-schema.ts";

/** `timestamptz … default now() not null`, the only timestamp shape used. */
const stamp = (name: string) =>
  timestamp(name, { withTimezone: true }).defaultNow().notNull();

/** The four capability levels, ordered view < comment < edit < full_access. */
const ACCESS_LEVELS = ["full_access", "edit", "comment", "view"] as const;

const levelCheck = (constraintName: string, column: string) =>
  check(
    constraintName,
    sql.raw(
      `${column} in (${ACCESS_LEVELS.map((level) => `'${level}'`).join(", ")})`
    )
  );

/**
 * Workspace pages. `doc` is the client's `localPageSchema` document; the
 * columns beside it exist for indexing, scoping and permission bookkeeping
 * only. `workspaceId` is effectively immutable: the page's own `(page, page,
 * 0)` closure row references it through both composite foreign keys, so an
 * UPDATE of it is rejected rather than stranding the page's blocks and grants
 * in the old workspace.
 */
export const pages = pgTable(
  "pages",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    doc: jsonb("doc").$type<LocalPage>().notNull(),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
    parentId: text("parent_id").generatedAlwaysAs(sql`doc ->> 'parentId'`),
    visibility: text("visibility").default("workspace").notNull(),
    inheritPermissions: boolean("inherit_permissions").default(true).notNull(),
  },
  (t) => [
    primaryKey({ name: "pages_pkey", columns: [t.workspaceId, t.id] }),
    foreignKey({
      name: "pages_workspace_id_fkey",
      columns: [t.workspaceId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    index("pages_ws_idx").on(t.workspaceId),
    index("pages_parent_idx").on(t.parentId),
    check(
      "pages_visibility_check",
      sql`visibility in ('workspace', 'private')`
    ),
  ]
);

/** Block rows sharded by page. `doc` is the client's `localBlockSchema`. */
export const blocks = pgTable(
  "blocks",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    pageId: text("page_id").notNull(),
    doc: jsonb("doc").$type<LocalBlock>().notNull(),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
  },
  (t) => [
    primaryKey({ name: "blocks_pkey", columns: [t.workspaceId, t.id] }),
    foreignKey({
      name: "blocks_workspace_id_fkey",
      columns: [t.workspaceId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    index("blocks_ws_idx").on(t.workspaceId),
    index("blocks_page_idx").on(t.pageId),
  ]
);

/** Database definitions. `doc` is the client's `localDatabaseSchema`. */
export const databases = pgTable(
  "databases",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    doc: jsonb("doc").$type<LocalDatabase>().notNull(),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
  },
  (t) => [
    primaryKey({ name: "databases_pkey", columns: [t.workspaceId, t.id] }),
    foreignKey({
      name: "databases_workspace_id_fkey",
      columns: [t.workspaceId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    index("databases_ws_idx").on(t.workspaceId),
  ]
);

/** Database rows. `doc` is the client's `localDatabaseRowSchema`. */
export const databaseRows = pgTable(
  "database_rows",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    databaseId: text("database_id").notNull(),
    doc: jsonb("doc").$type<LocalDatabaseRow>().notNull(),
    createdAt: stamp("created_at"),
    updatedAt: stamp("updated_at"),
  },
  (t) => [
    primaryKey({ name: "database_rows_pkey", columns: [t.workspaceId, t.id] }),
    foreignKey({
      name: "database_rows_workspace_id_fkey",
      columns: [t.workspaceId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    index("database_rows_ws_idx").on(t.workspaceId),
    index("database_rows_db_idx").on(t.databaseId),
  ]
);

/** Share-dialog subject: a named set of users within one workspace. */
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    createdAt: stamp("created_at"),
  },
  (t) => [
    foreignKey({
      name: "groups_workspace_id_fkey",
      columns: [t.workspaceId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    index("groups_ws_idx").on(t.workspaceId),
  ]
);

export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "group_members_pkey",
      columns: [t.groupId, t.userId],
    }),
    foreignKey({
      name: "group_members_group_id_fkey",
      columns: [t.groupId],
      foreignColumns: [groups.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "group_members_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    index("group_members_user_idx").on(t.userId),
  ]
);

/**
 * Explicit grants. `subjectId` defaults to the empty string so `workspace` and
 * `public` grants (which name no subject) still key uniquely per page.
 * `grantedBy` clears to null rather than cascading — a grant outlives the
 * account that issued it.
 */
export const pagePermissions = pgTable(
  "page_permissions",
  {
    pageId: text("page_id").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").default("").notNull(),
    level: text("level").notNull(),
    grantedBy: text("granted_by"),
    grantedAt: stamp("granted_at"),
    workspaceId: text("workspace_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "page_permissions_pkey",
      columns: [t.workspaceId, t.pageId, t.subjectType, t.subjectId],
    }),
    foreignKey({
      name: "page_permissions_page_fkey",
      columns: [t.workspaceId, t.pageId],
      foreignColumns: [pages.workspaceId, pages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "page_permissions_granted_by_fkey",
      columns: [t.grantedBy],
      foreignColumns: [user.id],
    }).onDelete("set null"),
    index("page_permissions_subject_idx").on(t.subjectType, t.subjectId),
    check(
      "page_permissions_subject_type_check",
      sql`subject_type in ('user', 'group', 'workspace', 'public')`
    ),
    levelCheck("page_permissions_level_check", "level"),
  ]
);

/**
 * Physical parent chain of every page, including the `(page, page, 0)` self
 * row, maintained by the closure triggers. A page's ancestors are always in
 * the page's own workspace. Permission truncation at
 * `inheritPermissions = false` happens at read time in `effective_level`, not
 * here.
 */
export const pageAncestors = pgTable(
  "page_ancestors",
  {
    pageId: text("page_id").notNull(),
    ancestorId: text("ancestor_id").notNull(),
    depth: integer("depth").notNull(),
    workspaceId: text("workspace_id").notNull(),
  },
  (t) => [
    primaryKey({
      name: "page_ancestors_pkey",
      columns: [t.workspaceId, t.pageId, t.ancestorId],
    }),
    foreignKey({
      name: "page_ancestors_page_fkey",
      columns: [t.workspaceId, t.pageId],
      foreignColumns: [pages.workspaceId, pages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "page_ancestors_ancestor_fkey",
      columns: [t.workspaceId, t.ancestorId],
      foreignColumns: [pages.workspaceId, pages.id],
    }).onDelete("cascade"),
    index("page_ancestors_anc_idx").on(t.workspaceId, t.ancestorId),
  ]
);

/**
 * Materialized projection of `effective_level` for every (user, page) pair
 * that resolves to some access, recomputed synchronously by the ReBAC
 * triggers. The shape host reads it on every snapshot and live poll, which is
 * what `user_page_access_ws_user_idx` serves.
 */
export const userPageAccess = pgTable(
  "user_page_access",
  {
    userId: text("user_id").notNull(),
    pageId: text("page_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    level: text("level").notNull(),
  },
  (t) => [
    primaryKey({
      name: "user_page_access_pkey",
      columns: [t.userId, t.workspaceId, t.pageId],
    }),
    foreignKey({
      name: "user_page_access_user_id_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_page_access_workspace_id_fkey",
      columns: [t.workspaceId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "user_page_access_page_fkey",
      columns: [t.workspaceId, t.pageId],
      foreignColumns: [pages.workspaceId, pages.id],
    }).onDelete("cascade"),
    index("user_page_access_ws_user_idx").on(t.workspaceId, t.userId),
    levelCheck("user_page_access_level_check", "level"),
  ]
);

/**
 * Append-only per-workspace change log fed by triggers on the content tables
 * and on `user_page_access`. The dev shape host serves it over Electric's HTTP
 * shape protocol. `rowId` is the content row's id for content tables and the
 * page id for access rows; the affected user then travels inside `doc`, which
 * is how the shape host filters access entries to the requesting user.
 */
export const shapeLog = pgTable(
  "shape_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tbl: text("tbl").notNull(),
    workspaceId: text("workspace_id").notNull(),
    rowId: text("row_id").notNull(),
    op: text("op").notNull(),
    txid: bigint("txid", { mode: "number" }).notNull(),
    doc: jsonb("doc").$type<
      LocalPage | LocalBlock | LocalDatabase | LocalDatabaseRow | MyAccessRow
    >(),
    createdAt: stamp("created_at"),
  },
  (t) => [
    index("shape_log_ws_idx").on(t.workspaceId, t.id),
    check("shape_log_op_check", sql`op in ('insert', 'update', 'delete')`),
  ]
);
