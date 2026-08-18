import { defineHandler, HTTPError, readBody } from "nitro/h3";
import { getSession } from "../../../src/server/auth.server.ts";
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
 *   scripts/rebac-check.mjs): the chain truncates at this page afterwards,
 *   which also drops role baselines.
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

interface PermissionsBody {
  action: "list" | "set" | "remove" | "setVisibility" | "setInherit";
  inherit?: boolean;
  level?: string;
  pageId: string;
  subjectId?: string;
  subjectType?: string;
  visibility?: string;
}

/** The permission chain for a page, truncated like `effective_level`. */
const CHAIN_CTE = `
  with chain_all as (
    select pa.ancestor_id, pa.depth, anc.inherit_permissions
    from page_ancestors pa
    join pages anc on anc.id = pa.ancestor_id
    where pa.page_id = $1
  ),
  cutoff as (
    select min(depth) as depth from chain_all where not inherit_permissions
  ),
  chain as (
    select ancestor_id, depth from chain_all
    where depth <= coalesce((select depth from cutoff), 2147483647)
  )`;

type Client = import("pg").PoolClient;

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

async function listGrants(client: Client, pageId: string) {
  const result = await client.query(
    `${CHAIN_CTE}
     select pp.subject_type, pp.subject_id, pp.level,
            pp.page_id as source_page_id, c.depth
     from page_permissions pp
     join chain c on c.ancestor_id = pp.page_id
     order by c.depth asc, pp.subject_type asc, pp.subject_id asc`,
    [pageId]
  );
  return result.rows.map((row) => ({
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    level: row.level,
    sourcePageId: row.source_page_id,
    inherited: row.depth > 0,
  }));
}

async function setGrant(
  client: Client,
  pageId: string,
  userId: string,
  body: PermissionsBody
): Promise<void> {
  const subject = subjectOf(body);
  if (!(body.level && LEVELS.has(body.level))) {
    throw HTTPError.status(400, "Unknown level");
  }
  await client.query(
    `insert into page_permissions (page_id, subject_type, subject_id, level, granted_by)
     values ($1, $2, $3, $4, $5)
     on conflict (page_id, subject_type, subject_id)
       do update set level = excluded.level, granted_by = excluded.granted_by`,
    [pageId, subject.type, subject.id, body.level, userId]
  );
}

async function removeGrant(
  client: Client,
  pageId: string,
  body: PermissionsBody
): Promise<void> {
  const subject = subjectOf(body);
  await client.query(
    `delete from page_permissions
     where page_id = $1 and subject_type = $2 and subject_id = $3`,
    [pageId, subject.type, subject.id]
  );
}

/** Pins the caller at full_access so the page stays manageable. */
async function pinCallerFullAccess(
  client: Client,
  pageId: string,
  userId: string
): Promise<void> {
  await client.query(
    `insert into page_permissions (page_id, subject_type, subject_id, level, granted_by)
     values ($1, 'user', $2, 'full_access', $2)
     on conflict (page_id, subject_type, subject_id)
       do update set level = 'full_access'`,
    [pageId, userId]
  );
}

async function setVisibility(
  client: Client,
  pageId: string,
  userId: string,
  body: PermissionsBody
): Promise<void> {
  if (!(body.visibility && VISIBILITIES.has(body.visibility))) {
    throw HTTPError.status(400, "Unknown visibility");
  }
  if (body.visibility === "private") {
    await pinCallerFullAccess(client, pageId, userId);
  }
  await client.query(
    "update pages set visibility = $2 where id = $1 and visibility is distinct from $2",
    [pageId, body.visibility]
  );
}

async function setInherit(
  client: Client,
  pageId: string,
  userId: string,
  body: PermissionsBody
): Promise<void> {
  if (typeof body.inherit !== "boolean") {
    throw HTTPError.status(400, "inherit must be a boolean");
  }
  if (!body.inherit) {
    // Restrict: freeze the currently-inherited grants onto the page before
    // the chain truncates here. Explicit grants already on the page win.
    await client.query(
      `${CHAIN_CTE}
       insert into page_permissions (page_id, subject_type, subject_id, level, granted_by)
       select $1, pp.subject_type, pp.subject_id, pp.level, $2
       from page_permissions pp
       join chain c on c.ancestor_id = pp.page_id
       where c.depth > 0
       on conflict (page_id, subject_type, subject_id) do nothing`,
      [pageId, userId]
    );
    await pinCallerFullAccess(client, pageId, userId);
  }
  await client.query(
    `update pages set inherit_permissions = $2
     where id = $1 and inherit_permissions is distinct from $2`,
    [pageId, body.inherit]
  );
}

async function runAction(
  client: Client,
  body: PermissionsBody,
  userId: string
): Promise<Record<string, unknown>> {
  const { action, pageId } = body;
  if (action === "list") {
    return { grants: await listGrants(client, pageId) };
  }
  if (action === "set") {
    await setGrant(client, pageId, userId, body);
  } else if (action === "remove") {
    await removeGrant(client, pageId, body);
  } else if (action === "setVisibility") {
    await setVisibility(client, pageId, userId, body);
  } else {
    await setInherit(client, pageId, userId, body);
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

export default defineHandler(async (event) => {
  const session = await getSession(event.req.headers);
  if (!session) {
    throw HTTPError.status(401, "Not signed in");
  }
  const body = await readBody<PermissionsBody>(event);
  if (!(body && ACTIONS.has(body.action) && typeof body.pageId === "string")) {
    throw HTTPError.status(400, "action and pageId are required");
  }
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const page = await client.query(
      "select visibility, inherit_permissions from pages where id = $1",
      [body.pageId]
    );
    if (page.rowCount === 0) {
      throw HTTPError.status(404, "Page not found");
    }
    const allowed = await client.query(
      "select can_access($1, $2, 'full_access') as ok",
      [session.user.id, body.pageId]
    );
    if (allowed.rows[0]?.ok !== true) {
      throw HTTPError.status(403, "full_access on the page is required");
    }
    const result = await runAction(client, body, session.user.id);
    await client.query("commit");
    if (body.action === "list") {
      return {
        ...result,
        visibility: page.rows[0].visibility,
        inheritPermissions: page.rows[0].inherit_permissions,
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
