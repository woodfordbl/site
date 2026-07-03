import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import {
  buildTemplateSnapshotFromPage,
  saveSnapshotAsTemplate,
  templateExists,
} from "@/lib/pages/template-store.ts";

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
        toast.success("Saved as template");
      })
      .catch(() => toast.error("Could not save template"));
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
