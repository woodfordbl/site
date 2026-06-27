"use client";

import { IconArrowBackUp, IconHistory } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

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
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  MenuDrawerSubDrawer,
  useMenuDrawerSub,
  useMenuPresentation,
} from "@/components/ui/menu-presentation.tsx";
import { usePageSnapshotContent } from "@/db/queries/use-page-snapshot-content.ts";
import { usePageSnapshots } from "@/db/queries/use-page-snapshots.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";
import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";
import { restorePageSnapshot } from "@/lib/pages/restore-page-snapshot.ts";

/** Preview + restore for one checkpoint, inside the nested preview sub-drawer. */
function PreviewBody({
  descriptor,
  pageId,
}: {
  descriptor: PageSnapshotDescriptor;
  pageId: string;
}) {
  const { content, isLoading } = usePageSnapshotContent(pageId, descriptor.id);
  // Resolves to the preview drawer's provider, whose close cascades the whole stack.
  const { close } = useMenuPresentation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRestore = () => {
    restorePageSnapshot(pageId, descriptor.id, descriptor.timestamp).catch(
      () => undefined
    );
    setConfirmOpen(false);
    close();
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <SnapshotPreview
          content={content}
          isLoading={isLoading}
          pageId={pageId}
        />
        <div className="shrink-0 border-t p-3">
          <Button
            className="w-full"
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            <IconArrowBackUp aria-hidden />
            Restore this version
          </Button>
        </div>
      </div>

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
    </>
  );
}

/**
 * Versions list + nested preview drawer. Lives inside the sub-drawer so it can
 * read the sub's open state from {@link useMenuDrawerSub} (the `DropdownMenuSub`
 * `onOpenChange` prop is dropped in drawer mode), gating the snapshot read.
 */
function VersionHistorySubBody({ pageId }: { pageId: string }) {
  const sub = useMenuDrawerSub();
  const subOpen = sub?.open ?? false;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { descriptors, isLoading } = usePageSnapshots(pageId, subOpen);

  // Reset the preview when the versions sub-drawer closes.
  useEffect(() => {
    if (!subOpen) {
      setPreviewId(null);
    }
  }, [subOpen]);

  const previewDescriptor = useMemo(
    () => descriptors.find((descriptor) => descriptor.id === previewId) ?? null,
    [descriptors, previewId]
  );

  return (
    <>
      {descriptors.length === 0 ? (
        <div className="px-3 py-3 text-muted-foreground text-sm">
          {isLoading ? "Loading…" : "No saved versions yet."}
        </div>
      ) : (
        descriptors.map((descriptor) => (
          <DropdownMenuItem
            closeOnClick={false}
            key={descriptor.id}
            onClick={() => setPreviewId(descriptor.id)}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">
                {formatRelativeTime(descriptor.timestamp)}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {descriptor.blockCount} blocks · {descriptor.wordCount} words
              </span>
            </span>
          </DropdownMenuItem>
        ))
      )}

      <MenuDrawerSubDrawer
        onOpenChange={(open) => {
          if (!open) {
            setPreviewId(null);
          }
        }}
        open={previewDescriptor !== null}
        title={
          previewDescriptor
            ? formatRelativeTime(previewDescriptor.timestamp)
            : "Version"
        }
      >
        {previewDescriptor ? (
          <PreviewBody descriptor={previewDescriptor} pageId={pageId} />
        ) : null}
      </MenuDrawerSubDrawer>
    </>
  );
}

/**
 * Touch-only version history: a sub-drawer of the page menu listing the saved
 * versions, each opening a further sub-drawer with the read-only preview +
 * restore. Desktop uses the full-view Dialog instead.
 */
export function PageVersionHistorySubmenu({ pageId }: { pageId: string }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconHistory />
        Version history
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        <VersionHistorySubBody pageId={pageId} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
