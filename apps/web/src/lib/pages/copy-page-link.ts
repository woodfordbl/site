import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  normalizePageSlug,
  pageNavTargetForUserPage,
} from "@/lib/pages/slugify.ts";
import { appToast } from "@/lib/toast/app-toast.ts";
import {
  TOAST_ID_COPY_LINK,
  TOAST_ID_COPY_LINK_ERROR,
} from "@/lib/toast/toast-ids.ts";

const TRAILING_SLASH_RE = /\/$/;

/**
 * Builds the absolute URL for a page (origin + resolved path), mirroring
 * {@link resolvePageNavTarget}: `routeBy: "id"` pages resolve to `/p/{slug}`
 * — including database hub and row pages, whose slugs are already
 * host-relative paths — and everything else to its metadata slug on `/` or `/$`.
 *
 * Returns `null` when `pageId` is absent from `pages`. Pages kept out of the
 * navigable list (the `site-template` snapshot, database row templates, the dev
 * canvas fixture) have no shareable link, and callers must fall back rather than
 * copy the bare origin.
 */
export function buildPageLinkUrl(
  pageId: string,
  pages: PageSummary[],
  origin: string
): string | null {
  const page = pages.find((candidate) => candidate.id === pageId);
  if (!page) {
    return null;
  }

  const base = origin.replace(TRAILING_SLASH_RE, "");

  if (page.routeBy === "id") {
    const param = pageNavTargetForUserPage(page.slug).params._splat;
    return `${base}/p/${param}`;
  }

  const path = normalizePageSlug(page.slug);
  return path === "/" ? `${base}/` : `${base}${path}`;
}

/**
 * Writes `url` to the system clipboard, resolving `false` instead of throwing
 * when the Clipboard API is missing (non-secure context) or the browser rejects
 * the write, so a single caller can surface one failure toast.
 */
export async function writeClipboardText(url: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies a page's absolute URL to the clipboard and reports the outcome with a
 * toast. Shared by every "Copy link" entry point (page header menu, sidebar row
 * menu, right-click menu, `copy-page-link` hotkey) so they behave identically.
 *
 * Call this directly from the click/key handler: the clipboard write starts
 * synchronously so it still counts as user-activated in Safari.
 */
export function copyPageLink(
  pageId: string,
  pages: PageSummary[]
): Promise<void> {
  // Pages outside the navigable list still live at the URL you are on.
  const url =
    buildPageLinkUrl(pageId, pages, window.location.origin) ??
    window.location.href;

  return writeClipboardText(url).then((copied) => {
    if (copied) {
      appToast.success("Link copied to clipboard", { id: TOAST_ID_COPY_LINK });
      return;
    }
    appToast.error("Could not copy link", { id: TOAST_ID_COPY_LINK_ERROR });
  });
}
