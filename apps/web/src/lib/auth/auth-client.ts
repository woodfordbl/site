/**
 * Better Auth browser client + the sign-in/out ↔ sync-mode bridge. The
 * `site-workspace` cookie is the boot-time switch that decides whether the
 * content collections are localStorage- or Electric-backed (see
 * src/db/collections/sync-mode.ts), so every auth transition sets/clears it
 * and reloads into the other mode.
 */
import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { setWorkspaceCookie } from "@/db/collections/sync-mode.ts";

export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

/** Enter synced mode in the given workspace (reloads the app). */
export function enterWorkspace(workspaceId: string): void {
  setWorkspaceCookie(workspaceId);
  window.location.href = "/";
}

/** Sign out, drop back to anonymous local-first mode (reloads the app). */
export async function signOutToLocalMode(): Promise<void> {
  await authClient.signOut();
  setWorkspaceCookie(null);
  window.location.href = "/";
}
