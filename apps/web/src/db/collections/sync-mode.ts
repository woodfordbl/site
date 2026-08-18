/**
 * Boot-time sync mode. Anonymous visitors run fully local (localStorage
 * collections, shipped blog SSR, dirty-cookie overlay — today's behavior,
 * untouched). A signed-in user with an active workspace gets Electric-backed
 * collections scoped to that workspace instead.
 *
 * The mode is decided ONCE per page load from the `site-workspace` cookie
 * (set on sign-in / workspace switch, cleared on sign-out — see
 * src/lib/auth/auth-client.ts) so the collection singletons every module
 * imports never change identity mid-session; auth transitions reload the page.
 */

export const WORKSPACE_COOKIE = "site-workspace";

export interface SyncContext {
  mode: "local" | "synced";
  workspaceId: string | null;
}

function readWorkspaceCookie(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const match = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${WORKSPACE_COOKIE}=`));
  const value = match?.slice(WORKSPACE_COOKIE.length + 1);
  return value ? decodeURIComponent(value) : null;
}

const bootWorkspaceId = readWorkspaceCookie();

export const syncContext: SyncContext = bootWorkspaceId
  ? { mode: "synced", workspaceId: bootWorkspaceId }
  : { mode: "local", workspaceId: null };

export function isSyncedMode(): boolean {
  return syncContext.mode === "synced";
}

export function setWorkspaceCookie(workspaceId: string | null): void {
  if (typeof document === "undefined") {
    return;
  }
  if (workspaceId) {
    // biome-ignore lint/suspicious/noDocumentCookie: mode-switch hint cookie, not auth (the session cookie is Better Auth's).
    document.cookie = `${WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; path=/; max-age=31536000; samesite=lax`;
  } else {
    // biome-ignore lint/suspicious/noDocumentCookie: mode-switch hint cookie, not auth (the session cookie is Better Auth's).
    document.cookie = `${WORKSPACE_COOKIE}=; path=/; max-age=0; samesite=lax`;
  }
}
