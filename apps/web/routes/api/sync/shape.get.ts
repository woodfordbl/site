import { defineHandler, getQuery, HTTPError } from "nitro/h3";
import {
  getSession,
  isWorkspaceMember,
} from "../../../src/server/auth.server.ts";
import {
  handleShapeRequest,
  SYNCED_TABLES,
} from "../../../src/server/shape-host.server.ts";

/**
 * `GET /api/sync/shape` — authorized shape reads over Electric's HTTP
 * protocol (served by the dev shape host; see src/server/shape-host.server.ts).
 *
 * This route plays the "auth proxy" role from the sync proposal: it validates
 * the session, checks workspace membership, and scopes the shape server-side —
 * the client picks a table and workspace but can never widen access beyond
 * the workspaces it belongs to.
 */

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

export default defineHandler(async (event) => {
  const session = await getSession(event.req.headers);
  if (!session) {
    throw HTTPError.status(401, "Not signed in");
  }
  const query = getQuery(event);
  const table = firstString(query.table);
  const workspaceId = firstString(query.ws);
  if (!(table && SYNCED_TABLES.has(table))) {
    throw HTTPError.status(400, "Unknown table");
  }
  if (!workspaceId) {
    throw HTTPError.status(400, "ws is required");
  }
  if (!(await isWorkspaceMember(session.user.id, workspaceId))) {
    throw HTTPError.status(403, "Not a member of this workspace");
  }
  const response = await handleShapeRequest({
    table,
    workspaceId,
    offset: firstString(query.offset) ?? "-1",
    handle: firstString(query.handle),
    live: firstString(query.live) === "true",
  });
  for (const [name, value] of Object.entries(response.headers)) {
    event.res.headers.set(name, value);
  }
  event.res.status = response.status;
  return response.body;
});
