/**
 * Better Auth server instance: email/password accounts plus the organization
 * plugin (workspaces + invitations). Auth tables live in the same Postgres as
 * workspace content (see src/server/migrations/0000_init.sql), so membership
 * checks in the sync endpoints are plain joins.
 *
 * Signup flow: a personal organization is auto-created for every new user, and
 * new sessions default their active organization to the user's first
 * membership so the client always has a workspace to sync.
 */
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { getPool } from "./db.server.ts";

const DEV_SECRET = "dev-only-secret-change-in-production";

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
  database: getPool(),
  secret: process.env.BETTER_AUTH_SECRET ?? DEV_SECRET,
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

export type AuthSession = typeof auth.$Infer.Session;

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
