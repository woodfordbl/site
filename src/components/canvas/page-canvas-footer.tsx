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
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { readBlockShardForPage } from "@/db/collections/read-block-shard.ts";
import { deleteAllBlocksForPage } from "@/db/queries/block-collection-ops.ts";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { exportPageDocument } from "@/lib/content/page-export.ts";
import { savePage } from "@/lib/content/save-page.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";

interface PageCanvasFooterProps {
  hasLocalChanges: boolean;
  isStale: boolean;
  onAcknowledgeStale: () => void;
  onReset: () => void;
  onRevertToServer: () => void;
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
  pageParentId,
  pageSlug,
  pageTitle,
  rows,
}: PageCanvasFooterProps) {
  const [resetOpen, setResetOpen] = useState(false);
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

  if (!(isDev || hasLocalChanges || isStale)) {
    return null;
  }

  const handleSave = async () => {
    setSaveStatus("Saving…");
    try {
      const doc = exportPageDocument(rows, {
        id: pageId,
        slug: resolvedSlug,
        title: resolvedTitle,
        parentId: resolvedParentId,
      });
      await savePage({ data: doc });
      if (localPages[0]) {
        localPagesCollection.delete(pageId);
        deleteAllBlocksForPage(readBlockShardForPage(pageId));
        markPageClean(pageId);
      }
      setSaveStatus("Saved to content/pages. Commit and deploy.");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  const handleReset = () => {
    onReset();
    setResetOpen(false);
  };

  return (
    <div className="mt-12 border-t pt-6">
      <div className="flex flex-wrap items-center gap-2">
        {isDev ? (
          <Button
            onClick={() => {
              handleSave().catch(() => undefined);
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Save
          </Button>
        ) : null}
        {hasLocalChanges ? (
          <Button
            onClick={() => setResetOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Reset
          </Button>
        ) : null}
        {isStale ? (
          <StaleBanner
            onAcknowledge={onAcknowledgeStale}
            onRevert={onRevertToServer}
          />
        ) : null}
        {saveStatus ? (
          <span className="text-muted-foreground text-sm">{saveStatus}</span>
        ) : null}
      </div>
      <Dialog onOpenChange={setResetOpen} open={resetOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Reset to published version?</DialogTitle>
            <DialogDescription>
              Your local edits on this page will be removed. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setResetOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleReset} type="button" variant="destructive">
              Reset page
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
