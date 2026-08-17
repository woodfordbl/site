/**
 * @fileoverview Drizzle definitions for the tables Better Auth owns: the core
 * account model (`user`, `session`, `account`, `verification`) and the
 * organization plugin's workspace model (`organization`, `member`,
 * `invitation`). Shape and field names come from `@better-auth/cli generate`,
 * which is the authority on what the library reads and writes — `invitation`
 * carrying `createdAt` is exactly the kind of expectation that is not
 * negotiable and was once missed.
 *
 * Two deliberate deviations from the generator's output:
 * - Database column names are quoted camelCase (`"emailVerified"`,
 *   `"organizationId"`) rather than the generator's snake_case. Better Auth
 *   resolves fields through the Drizzle property names, not the column names,
 *   so this is invisible to the library — but the SQL permission functions and
 *   the raw-SQL query sites join on these columns by name, and the workspace
 *   content tables reference `organization`/`user`.
 * - Timestamps are `timestamptz`, and `createdAt`/`updatedAt` default to
 *   `now()` on every table. The generator emits naive `timestamp` and omits
 *   the default on `session.updatedAt`, `account.updatedAt`,
 *   `organization.createdAt` and `member.createdAt`; a workspace row inserted
 *   by anything other than the plugin (see `createPersonalWorkspace` in
 *   `src/server/auth.server.ts`) needs those defaults.
 *
 * Constraint and index names are pinned to the ones Postgres assigned under
 * the hand-written DDL this file replaces.
 */
import {
  boolean,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const stamp = () => timestamp({ withTimezone: true }).defaultNow().notNull();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("user_email_key"),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  image: text("image"),
  createdAt: stamp(),
  updatedAt: stamp(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique("session_token_key"),
    createdAt: stamp(),
    updatedAt: stamp(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    userId: text("userId").notNull(),
    activeOrganizationId: text("activeOrganizationId"),
  },
  (t) => [
    foreignKey({
      name: "session_userId_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    index("session_user_idx").on(t.userId),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: stamp(),
    updatedAt: stamp(),
  },
  (t) => [
    foreignKey({
      name: "account_userId_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    index("account_user_idx").on(t.userId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: stamp(),
  updatedAt: stamp(),
});

/** A workspace. Content tables scope every row to one of these by id. */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique("organization_slug_key"),
  logo: text("logo"),
  createdAt: stamp(),
  metadata: text("metadata"),
});

/**
 * Workspace membership. `role` is the baseline the permission model reads:
 * owner/admin resolve to `full_access`, member to `edit`, guest to nothing but
 * its explicit grants.
 */
export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").notNull(),
    userId: text("userId").notNull(),
    role: text("role").default("member").notNull(),
    createdAt: stamp(),
  },
  (t) => [
    foreignKey({
      name: "member_organizationId_fkey",
      columns: [t.organizationId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "member_userId_fkey",
      columns: [t.userId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    index("member_org_idx").on(t.organizationId),
    index("member_user_idx").on(t.userId),
  ]
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organizationId").notNull(),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    inviterId: text("inviterId").notNull(),
    createdAt: stamp(),
  },
  (t) => [
    foreignKey({
      name: "invitation_organizationId_fkey",
      columns: [t.organizationId],
      foreignColumns: [organization.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "invitation_inviterId_fkey",
      columns: [t.inviterId],
      foreignColumns: [user.id],
    }).onDelete("cascade"),
    index("invitation_org_idx").on(t.organizationId),
    index("invitation_email_idx").on(t.email),
  ]
);
