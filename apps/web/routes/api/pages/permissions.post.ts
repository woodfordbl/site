import { defineHandler, getCookie, HTTPError, readBody } from "nitro/h3";
import {
  getSession,
  isWorkspaceMember,
} from "../../../src/server/auth.server.ts";
import { getPool } from "../../../src/server/db.server.ts";

/**
 * `POST /api/pages/permissions` — the share dialog's control surface. One
 * action per request (`{action, pageId, ...}`):
 *
 * - `list`: the page's visibility/inherit flags plus every grant on its
 *   permission chain (truncated at the nearest restricted ancestor, matching
 *   `effective_level`), each tagged with the chain node it sits on
 *   (`sourcePageId`, `inherited`).
 * - `set`: upsert one page_permissions grant (subject user|group|workspace).
 * - `remove`: delete one grant from the page itself.
 * - `setVisibility`: workspace|private. Going private also upserts the caller
 *   a full_access grant — the member baseline only applies to
 *   workspace-visible pages, so without it the page would lock everyone out.
 * - `setInherit`: true|false. Turning inheritance OFF first copies the
 *   currently-inherited grants onto the page and pins the caller at
 *   full_access (Restrict semantics — see the worked example in
 *   src/server/access-model.test.ts): the chain truncates at this page
 *   afterwards, which also drops role baselines.
 *
 * A page id only names a page together with a workspace (migration 0005), and
 * the body carries no workspace, so the request is scoped to the caller's
 * active workspace — the `site-workspace` cookie the client's collections sync
 * against (src/db/collections/sync-mode.ts). That cookie selects a scope, it
 * never grants anything: the caller must be a member of the workspace it names
 * and hold `full_access` on the page inside it, so pointing it at a stranger's
 * workspace only produces a 403.
 *
 * Caller must hold `full_access` on the page (workspace owners/admins pass
 * via their baseline). Every action runs in one transaction; page_permissions
 * and pages changes fire the ReBAC projection triggers, whose
 * user_page_access transitions land in shape_log (migration 0004) — that is
 * what makes open shapes converge live (grant inserts / synthetic deletes)
 * without any extra signalling here.
 */

const LEVELS = new Set(["view", "comment", "edit", "full_access"]);
const SUBJECT_TYPES = new Set(["user", "group", "workspace"]);
const VISIBILITIES = new Set(["workspace", "private"]);

/** Mirrors `WORKSPACE_COOKIE` in src/db/collections/sync-mode.ts. */
const WORKSPACE_COOKIE = "site-workspace";

interface PermissionsBody {
  action: "list" | "set" | "remove" | "setVisibility" | "setInherit";
  inherit?: boolean;
  level?: string;
  pageId: string;
  subjectId?: string;
  subjectType?: string;
  visibility?: string;
}

type Client = import("pg").PoolClient;

/** The one page one caller acts on, in the one workspace that owns it. */
interface Scope {
  client: Client;
  pageId: string;
  userId: string;
  workspaceId: string;
}

/**
 * The permission chain for `$1 = workspace, $2 = page`, truncated like
 * `effective_level`. Ancestors are always in the page's own workspace, so the
 * closure and the pages join are both scoped by it.
 */
const CHAIN_CTE = `
  with chain_all as (
    select pa.ancestor_id, pa.depth, anc.inherit_permissions
    from page_ancestors pa
    join pages anc
      on anc.workspace_id = pa.workspace_id and anc.id = pa.ancestor_id
    where pa.workspace_id = $1 and pa.page_id = $2
  ),
  cutoff as (
    select min(depth) as depth from chain_all where not inherit_permissions
  ),
  chain as (
    select ancestor_id, depth from chain_all
    where depth <= coalesce((select depth from cutoff), 2147483647)
  )`;

function subjectOf(body: PermissionsBody): { type: string; id: string } {
  const type = body.subjectType ?? "";
  if (!SUBJECT_TYPES.has(type)) {
    throw HTTPError.status(400, "Unknown subjectType");
  }
  // Workspace-wide grants use the sentinel empty subject_id (schema default).
  const id = type === "workspace" ? "" : body.subjectId;
  if (typeof id !== "string") {
    throw HTTPError.status(400, "subjectId is required");
  }
  return { type, id };
}

async function listGrants(scope: Scope) {
  const result = await scope.client.query(
    `${CHAIN_CTE}
     select pp.subject_type, pp.subject_id, pp.level,
            pp.page_id as source_page_id, c.depth
     from page_permissions pp
     join chain c on c.ancestor_id = pp.page_id
     where pp.workspace_id = $1
     order by c.depth asc, pp.subject_type asc, pp.subject_id asc`,
    [scope.workspaceId, scope.pageId]
  );
  return result.rows.map((row) => ({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    level: row.level,
    sourcePageId: row.source_page_id,
    inherited: row.depth > 0,
  }));
}

async function setGrant(scope: Scope, body: PermissionsBody): Promise<void> {
  const subject = subjectOf(body);
  if (!(body.level && LEVELS.has(body.level))) {
    throw HTTPError.status(400, "Unknown level");
  }
  await scope.client.query(
    `insert into page_permissions
       (workspace_id, page_id, subject_type, subject_id, level, granted_by)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (workspace_id, page_id, subject_type, subject_id)
       do update set level = excluded.level, granted_by = excluded.granted_by`,
    [
      scope.workspaceId,
      scope.pageId,
      subject.type,
      subject.id,
      body.level,
      scope.userId,
    ]
  );
}

async function removeGrant(scope: Scope, body: PermissionsBody): Promise<void> {
  const subject = subjectOf(body);
  await scope.client.query(
    `delete from page_permissions
     where workspace_id = $1 and page_id = $2
       and subject_type = $3 and subject_id = $4`,
    [scope.workspaceId, scope.pageId, subject.type, subject.id]
  );
}

/** Pins the caller at full_access so the page stays manageable. */
async function pinCallerFullAccess(scope: Scope): Promise<void> {
  await scope.client.query(
    `insert into page_permissions
       (workspace_id, page_id, subject_type, subject_id, level, granted_by)
     values ($1, $2, 'user', $3, 'full_access', $3)
     on conflict (workspace_id, page_id, subject_type, subject_id)
       do update set level = 'full_access'`,
    [scope.workspaceId, scope.pageId, scope.userId]
  );
}

async function setVisibility(
  scope: Scope,
  body: PermissionsBody
): Promise<void> {
  if (!(body.visibility && VISIBILITIES.has(body.visibility))) {
    throw HTTPError.status(400, "Unknown visibility");
  }
  if (body.visibility === "private") {
    await pinCallerFullAccess(scope);
  }
  await scope.client.query(
    `update pages set visibility = $3
     where workspace_id = $1 and id = $2 and visibility is distinct from $3`,
    [scope.workspaceId, scope.pageId, body.visibility]
  );
}

async function setInherit(scope: Scope, body: PermissionsBody): Promise<void> {
  if (typeof body.inherit !== "boolean") {
    throw HTTPError.status(400, "inherit must be a boolean");
  }
  if (!body.inherit) {
    // Restrict: freeze the currently-inherited grants onto the page before
    // the chain truncates here. Explicit grants already on the page win.
    await scope.client.query(
      `${CHAIN_CTE}
       insert into page_permissions
         (workspace_id, page_id, subject_type, subject_id, level, granted_by)
       select $1, $2, pp.subject_type, pp.subject_id, pp.level, $3
       from page_permissions pp
       join chain c on c.ancestor_id = pp.page_id
       where pp.workspace_id = $1 and c.depth > 0
       on conflict (workspace_id, page_id, subject_type, subject_id)
         do nothing`,
      [scope.workspaceId, scope.pageId, scope.userId]
    );
    await pinCallerFullAccess(scope);
  }
  await scope.client.query(
    `update pages set inherit_permissions = $3
     where workspace_id = $1 and id = $2
       and inherit_permissions is distinct from $3`,
    [scope.workspaceId, scope.pageId, body.inherit]
  );
}

async function runAction(
  scope: Scope,
  body: PermissionsBody
): Promise<Record<string, unknown>> {
  const { action } = body;
  if (action === "list") {
    return { grants: await listGrants(scope) };
  }
  if (action === "set") {
    await setGrant(scope, body);
  } else if (action === "remove") {
    await removeGrant(scope, body);
  } else if (action === "setVisibility") {
    await setVisibility(scope, body);
  } else {
    await setInherit(scope, body);
  }
  return { ok: true };
}

const ACTIONS = new Set([
  "list",
  "set",
  "remove",
  "setVisibility",
  "setInherit",
]);

/** The page's own flags; 404s when the workspace holds no such page. */
async function readPage(scope: Scope) {
  const page = await scope.client.query(
    `select visibility, inherit_permissions from pages
     where workspace_id = $1 and id = $2`,
    [scope.workspaceId, scope.pageId]
  );
  if (page.rowCount === 0) {
    throw HTTPError.status(404, "Page not found");
  }
  const allowed = await scope.client.query(
    "select can_access($1, $2, $3, 'full_access') as ok",
    [scope.userId, scope.workspaceId, scope.pageId]
  );
  if (allowed.rows[0]?.ok !== true) {
    throw HTTPError.status(403, "full_access on the page is required");
  }
  return page.rows[0];
}

export default defineHandler(async (event) => {
  const session = await getSession(event.req.headers);
  if (!session) {
    throw HTTPError.status(401, "Not signed in");
  }
  const workspaceId = getCookie(event, WORKSPACE_COOKIE);
  if (!workspaceId) {
    throw HTTPError.status(400, "No active workspace");
  }
  if (!(await isWorkspaceMember(session.user.id, workspaceId))) {
    throw HTTPError.status(403, "Not a member of this workspace");
  }
  const body = await readBody<PermissionsBody>(event);
  if (!(body && ACTIONS.has(body.action) && typeof body.pageId === "string")) {
    throw HTTPError.status(400, "action and pageId are required");
  }
  const client = await getPool().connect();
  const scope: Scope = {
    client,
    pageId: body.pageId,
    userId: session.user.id,
    workspaceId,
  };
  try {
    await client.query("begin");
    const page = await readPage(scope);
    const result = await runAction(scope, body);
    await client.query("commit");
    if (body.action === "list") {
      return {
        ...result,
        visibility: page.visibility,
        inheritPermissions: page.inherit_permissions,
      };
    }
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
});
