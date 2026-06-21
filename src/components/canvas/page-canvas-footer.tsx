import { eq, useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";

import { StaleBanner } from "@/components/canvas/stale-banner.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { sweepOrphanAssets } from "@/db/assets/asset-gc.ts";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { exportPageDocument } from "@/lib/content/page-export.ts";
import { preparePageDocumentForAuthorSave } from "@/lib/content/prepare-page-document-for-author-save.ts";
import { saveMediaAssets } from "@/lib/content/save-media-assets.ts";
import { savePage } from "@/lib/content/save-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";

interface PageCanvasFooterProps {
  hasLocalChanges: boolean;
  isStale: boolean;
  onAcknowledgeStale: () => void;
  onReset: () => void;
  onRevertToServer: () => void;
  pageIcon?: string;
  pageId: string;
  pageParentId: string | null;
  pageSlug: string;
  pageTitle: string;
  rows: CanvasRow[];
}

export function PageCanvasFooter({
  hasLocalChanges,
  isStale,
  onAcknowledgeStale,
  onReset,
  onRevertToServer,
  pageId,
  pageIcon,
  pageParentId,
  pageSlug,
  pageTitle,
  rows,
}: PageCanvasFooterProps) {
  const [confirmAction, setConfirmAction] = useState<"reset" | "revert" | null>(
    null
  );
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const isDev = import.meta.env.DEV;
  const { data: localPages = [] } = useLiveQuery(
    (query) =>
      query
        .from({ page: localPagesCollection })
        .where(({ page }) => eq(page.id, pageId)),
    [pageId]
  );

  const localPage = localPages[0] ?? null;
  const resolvedTitle = localPage?.title ?? pageTitle;
  const resolvedSlug = localPage?.slug ?? pageSlug;
  const resolvedParentId = localPage?.parentId ?? pageParentId;
  const resolvedIcon = localPage?.icon ?? pageIcon;

  if (!(isDev || hasLocalChanges || isStale)) {
    return null;
  }

  const handleSave = async () => {
    setSaveStatus("Saving…");
    try {
      const exported = exportPageDocument(rows, {
        id: pageId,
        slug: resolvedSlug,
        title: resolvedTitle,
        parentId: resolvedParentId,
        icon: resolvedIcon,
      });
      const { doc, assets } = await preparePageDocumentForAuthorSave(exported);
      if (assets.length > 0) {
        await saveMediaAssets({ data: { assets } });
      }
      await savePage({ data: doc });
      if (localPages[0]) {
        localPagesCollection.delete(pageId);
        deleteAllBlocksForPage(readBlockShardForPage(pageId));
        markPageClean(pageId);
      }
      await sweepOrphanAssets();
      setSaveStatus("Saved to content/pages. Commit and deploy.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  const handleConfirm = () => {
    if (confirmAction === "reset") {
      onReset();
    } else if (confirmAction === "revert") {
      onRevertToServer();
    }
    setConfirmAction(null);
  };

  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
      {saveStatus ? (
        <span className="text-muted-foreground text-xs">{saveStatus}</span>
      ) : null}
      {isStale ? (
        <StaleBanner
          onAcknowledge={onAcknowledgeStale}
          onRevert={() => setConfirmAction("revert")}
        />
      ) : null}
      {isDev ? (
        <Button
          onClick={() => {
            handleSave().catch(() => undefined);
          }}
          size="xs"
          type="button"
          variant="outline"
        >
          Save
        </Button>
      ) : null}
      {hasLocalChanges ? (
        <Button
          onClick={() => setConfirmAction("reset")}
          size="xs"
          type="button"
          variant="outline"
        >
          Reset
        </Button>
      ) : null}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
        open={confirmAction !== null}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "revert"
                ? "Use the site version?"
                : "Reset to published version?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "revert"
                ? "This page was updated on the site since you edited it. Switching to the site version removes your local edits. This cannot be undone."
                : "Your local edits on this page will be removed. This cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmAction(null)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleConfirm} type="button" variant="destructive">
              {confirmAction === "revert" ? "Use site version" : "Reset page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
