/**
 * @fileoverview Better Auth server instance: email/password accounts plus the
 * organization plugin (workspaces + invitations). It reads and writes the
 * tables declared in `src/server/auth-schema.ts` through the shared pool, so
 * auth and workspace content live in one database and membership checks in the
 * sync endpoints are plain joins.
 *
 * Signup flow: a personal organization is auto-created for every new user, and
 * new sessions default their active organization to the user's first
 * membership so the client always has a workspace to sync.
 *
 * Secret contract: local development and the test runner may sign sessions
 * with the {@link DEV_SECRET} constant so the repository stays zero-config;
 * every other environment must supply `BETTER_AUTH_SECRET`. See
 * {@link resolveAuthSecret}.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import {
  account,
  invitation,
  member,
  organization as organizationTable,
  session,
  user,
  verification,
} from "@/server/auth-schema.ts";
import { db, getPool } from "./db.server.ts";

/** Better Auth resolves its models by these keys, so the names are its API. */
const schema = {
  user,
  session,
  account,
  verification,
  organization: organizationTable,
  member,
  invitation,
};

/** Stand-in secret for local work only; never valid outside development. */
const DEV_SECRET = "dev-only-secret-change-in-production";

/**
 * Resolves the secret Better Auth signs session cookies and tokens with.
 *
 * Only local development and the vitest runner may fall back to
 * {@link DEV_SECRET}, so `pnpm dev` and `pnpm test` need no setup. That
 * constant is public repository text: any deploy that reached it would let a
 * reader of the repository forge a session, and — unlike a wrong database URL,
 * which cannot connect — the failure is silent until it is exploited. Every
 * other environment therefore fails at startup rather than falling back.
 *
 * Development must be stated, never assumed: the signals are `VITEST` (set by
 * the test runner) and `NODE_ENV` of `development` or `test`, both set by the
 * tool that owns the environment — Vite's dev server assigns
 * `NODE_ENV=development` to its own process. Every other value, including
 * unset, fails closed, so a deploy path that never sets `NODE_ENV` cannot
 * silently reach {@link DEV_SECRET}.
 *
 * @returns The configured secret, or {@link DEV_SECRET} in development.
 * @throws {Error} When `BETTER_AUTH_SECRET` is missing or empty anywhere
 *   other than local development.
 */
function resolveAuthSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET?.trim();
  if (configured) {
    return configured;
  }
  const nodeEnv = process.env.NODE_ENV;
  const isDevelopment =
    Boolean(process.env.VITEST) ||
    nodeEnv === "development" ||
    nodeEnv === "test";
  if (isDevelopment) {
    return DEV_SECRET;
  }
  throw new Error(
    "BETTER_AUTH_SECRET is required outside local development. Set it to a " +
      "high-entropy random string (for example `openssl rand -base64 32`); " +
      "it signs every session cookie, so a shared or guessable value lets " +
      "anyone forge a session."
  );
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "workspace"}-${crypto.randomUUID().slice(0, 8)}`;
}

async function createPersonalWorkspace(userId: string, name: string) {
  const pool = getPool();
  const orgId = crypto.randomUUID();
  const workspaceName = `${name.split(" ")[0] || "My"}'s workspace`;
  await pool.query(
    `insert into "organization" ("id", "name", "slug") values ($1, $2, $3)`,
    [orgId, workspaceName, slugify(workspaceName)]
  );
  await pool.query(
    `insert into "member" ("id", "organizationId", "userId", "role")
     values ($1, $2, $3, 'owner')`,
    [crypto.randomUUID(), orgId, userId]
  );
  // Sign-up creates the session before this hook runs, so the
  // session.create.before default below misses the brand-new workspace —
  // point any org-less open sessions at it.
  await pool.query(
    `update "session" set "activeOrganizationId" = $1
     where "userId" = $2 and "activeOrganizationId" is null`,
    [orgId, userId]
  );
}

async function firstMembershipOrg(userId: string): Promise<string | null> {
  const result = await getPool().query(
    `select "organizationId" from "member" where "userId" = $1
     order by "createdAt" asc limit 1`,
    [userId]
  );
  return result.rows[0]?.organizationId ?? null;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: resolveAuthSecret(),
  baseURL: process.env.SITE_ORIGIN ?? "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  databaseHooks: {
    user: {
      create: {
        // Local dev has no email transport, and the organization plugin's
        // invitation listing hard-requires a verified email — auto-verify at
        // signup. Production wires a real sender and drops this.
        before: (user) =>
          Promise.resolve({ data: { ...user, emailVerified: true } }),
        after: async (user) => {
          await createPersonalWorkspace(user.id, user.name);
        },
      },
    },
    session: {
      create: {
        before: async (session) => ({
          data: {
            ...session,
            activeOrganizationId: await firstMembershipOrg(session.userId),
          },
        }),
      },
    },
  },
  plugins: [
    organization({
      requireEmailVerificationOnInvitation: false,
      // No email transport in local dev: invitees see pending invitations in
      // the workspace switcher (listUserInvitations) and accept in-app.
      sendInvitationEmail: (data) => {
        console.log(
          `[invitation] ${data.email} invited to ${data.organization.name} (id ${data.id})`
        );
        return Promise.resolve();
      },
    }),
  ],
});

/** Resolves the Better Auth session from request headers, or null. */
export async function getSession(headers: Headers) {
  return await auth.api.getSession({ headers });
}

/** True when the user is a member of the workspace (organization). */
export async function isWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const result = await getPool().query(
    `select 1 from "member" where "userId" = $1 and "organizationId" = $2 limit 1`,
    [userId, workspaceId]
  );
  return result.rows.length > 0;
}
