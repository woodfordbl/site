import type { useNavigate } from "@tanstack/react-router";

import type { DatabaseRenameSlugChange } from "@/db/queries/database-page-ops.ts";
import { resolveSlugPrefixRedirect } from "@/lib/pages/resolve-slug-prefix-redirect.ts";

type NavigateFn = ReturnType<typeof useNavigate>;

/**
 * After {@link renameDatabase} rewrites the hub slug, router-navigate (replace)
 * so splat params rematch. Never use `history.replaceState` alone here — that
 * leaves TanStack Router on the stale path and flashes not-found.
 */
export function navigateAfterDatabaseHubRename(
  navigate: NavigateFn,
  change: DatabaseRenameSlugChange | null
): void {
  if (!change || typeof window === "undefined") {
    return;
  }

  const target = resolveSlugPrefixRedirect({
    nextPrefix: change.nextHubSlug,
    pathname: window.location.pathname,
    previousPrefix: change.previousHubSlug,
  });
  if (!target) {
    return;
  }

  navigate({ ...target, replace: true });
}
