import { useState } from "react";

import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useSiteContentUpdates } from "@/hooks/use-site-content-updates.ts";
import { saveAllLocalPages } from "@/lib/content/save-all-pages.ts";
import { refreshSiteContent } from "@/lib/pages/refresh-site-content.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";

export type PageCanvasConfirmAction =
  | "reset"
  | "resetAll"
  | "refresh"
  | "saveAll";

export const PAGE_CANVAS_CONFIRM_DIALOG_COPY: Record<
  PageCanvasConfirmAction,
  { title: string; description: string; confirmLabel: string }
> = {
  saveAll: {
    title: "Save all pages to source?",
    description:
      "Every locally-edited page is written to content/pages and your local copies are cleared. Commit and deploy to publish.",
    confirmLabel: "Save all",
  },
  refresh: {
    title: "Refresh site content?",
    description:
      "Pages you edited that changed on the site are replaced with the latest published version. Your other local edits are kept. This cannot be undone.",
    confirmLabel: "Refresh content",
  },
  resetAll: {
    title: "Reset all local changes?",
    description:
      "All local edits and custom pages will be removed. Shipped site pages will be restored. This cannot be undone.",
    confirmLabel: "Reset all",
  },
  reset: {
    title: "Reset to site version?",
    description:
      "Your local edits on this page will be removed and the shipped site version restored. This cannot be undone.",
    confirmLabel: "Reset page",
  },
};

export interface PageCanvasFooterActionsInput {
  /** Bumped after an action clears local state so the open canvas remounts on fresh data. */
  onAfterReset?: () => void;
  pageId: string;
}

export function usePageCanvasFooterActions({
  onAfterReset,
  pageId,
}: PageCanvasFooterActionsInput) {
  const [confirmAction, setConfirmAction] =
    useState<PageCanvasConfirmAction | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;
  const dispatch = usePageDispatch();
  const localPage = useLocalPageById(pageId);
  const { hasUpdates, stalePageIds } = useSiteContentUpdates();

  const hasLocalChanges = localPage != null && !isLocallyDeletedPage(localPage);
  const visible = isDev || hasLocalChanges || hasUpdates;

  const handleSaveAll = async () => {
    setSaveStatus("Saving all pages…");
    try {
      const result = await saveAllLocalPages();
      const noun = result.saved === 1 ? "page" : "pages";
      setSaveStatus(
        result.failed.length > 0
          ? `Saved ${result.saved} ${noun}, ${result.failed.length} failed. Commit and deploy.`
          : `Saved ${result.saved} ${noun} to content/pages. Commit and deploy.`
      );
      onAfterReset?.();
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  const handleConfirm = () => {
    switch (confirmAction) {
      case "reset":
        resetPageToRemote(pageId);
        onAfterReset?.();
        break;
      case "resetAll":
        dispatch({ type: "page.resetAllToRemote" });
        break;
      case "refresh":
        refreshSiteContent(stalePageIds);
        onAfterReset?.();
        break;
      case "saveAll":
        handleSaveAll().catch(() => undefined);
        break;
      default:
        break;
    }
    setConfirmAction(null);
  };

  return {
    confirmAction,
    handleConfirm,
    hasLocalChanges,
    hasUpdates,
    isDev,
    saveStatus,
    setConfirmAction,
    visible,
  };
}
