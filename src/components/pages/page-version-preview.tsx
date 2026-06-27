"use client";

import { IconArrowBackUp, IconX } from "@tabler/icons-react";
import { useState } from "react";

import { SnapshotPreview } from "@/components/pages/snapshot-preview.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { usePageSnapshotContent } from "@/db/queries/use-page-snapshot-content.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";
import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";
import { restorePageSnapshot } from "@/lib/pages/restore-page-snapshot.ts";

interface PageVersionPreviewProps {
  descriptor: PageSnapshotDescriptor;
  onExit: () => void;
  onRestored: () => void;
  pageId: string;
}

/**
 * Takes over the page workspace with a read-only render of a checkpoint —
 * the normal page, nothing editable, with **Exit** and **Restore** in a header.
 */
export function PageVersionPreview({
  descriptor,
  onExit,
  onRestored,
  pageId,
}: PageVersionPreviewProps) {
  const { content, isLoading } = usePageSnapshotContent(pageId, descriptor.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRestore = () => {
    restorePageSnapshot(pageId, descriptor.id, descriptor.timestamp).catch(
      () => undefined
    );
    setConfirmOpen(false);
    onRestored();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
        <Button onClick={onExit} size="sm" type="button" variant="ghost">
          <IconX aria-hidden />
          Exit
        </Button>
        <span className="truncate text-muted-foreground text-sm">
          Viewing version · {formatRelativeTime(descriptor.timestamp)}
        </span>
        <Button onClick={() => setConfirmOpen(true)} size="sm" type="button">
          <IconArrowBackUp aria-hidden />
          Restore this version
        </Button>
      </div>

      <SnapshotPreview
        content={content}
        isLoading={isLoading}
        pageId={pageId}
      />

      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Restore this version?</DialogTitle>
            <DialogDescription>
              The page reverts to its state from{" "}
              {formatRelativeTime(descriptor.timestamp)}. Your current version
              is saved first, so you can undo this.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmOpen(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={handleRestore} type="button">
              Restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
