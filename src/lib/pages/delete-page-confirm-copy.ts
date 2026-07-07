import type { LocalPage } from "@/lib/schemas/local-page.ts";

/** Body copy for the shared "Delete page?" confirmation dialog. */
export function getDeletePageConfirmDescription(
  localPage: Pick<LocalPage, "serverBaselineHash"> | null | undefined
): string {
  return localPage && localPage.serverBaselineHash === null
    ? "This page and its blocks will be removed. This cannot be undone."
    : "This page will be hidden locally. The published version will remain.";
}
