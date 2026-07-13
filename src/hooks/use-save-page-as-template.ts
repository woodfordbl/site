import { useCallback, useState } from "react";

import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import {
  buildTemplateSnapshotFromPage,
  saveSnapshotAsTemplate,
  templateExists,
} from "@/lib/pages/template-store.ts";
import { appToast } from "@/lib/toast/app-toast.ts";
import {
  TOAST_ID_SAVE_TEMPLATE,
  TOAST_ID_SAVE_TEMPLATE_ERROR,
} from "@/lib/toast/toast-ids.ts";

/**
 * Snapshots a page into the standalone template store. Requesting a save while a
 * template already exists opens a replace-confirm dialog; otherwise it saves
 * immediately. Used by the sidebar row menu and context menu.
 */
export function useSavePageAsTemplate(page: PageSummary) {
  const { setTemplatePageId } = useTemplatePage();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = useCallback(() => {
    buildTemplateSnapshotFromPage(page)
      .then((snapshot) => {
        saveSnapshotAsTemplate(snapshot);
        setTemplatePageId(TEMPLATE_PAGE_ID);
        appToast.success("Saved as template", { id: TOAST_ID_SAVE_TEMPLATE });
      })
      .catch(() =>
        appToast.error("Could not save template", {
          id: TOAST_ID_SAVE_TEMPLATE_ERROR,
        })
      );
  }, [page, setTemplatePageId]);

  const request = useCallback(() => {
    if (templateExists()) {
      setConfirmOpen(true);
      return;
    }
    save();
  }, [save]);

  const confirm = useCallback(() => {
    setConfirmOpen(false);
    save();
  }, [save]);

  return { confirm, confirmOpen, request, setConfirmOpen };
}
