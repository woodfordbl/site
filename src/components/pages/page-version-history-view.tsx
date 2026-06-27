"use client";

import { IconArrowBackUp, IconX } from "@tabler/icons-react";
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
import { usePageSnapshotContent } from "@/db/queries/use-page-snapshot-content.ts";
import { usePageSnapshots } from "@/db/queries/use-page-snapshots.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";
import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";
import { restorePageSnapshot } from "@/lib/pages/restore-page-snapshot.ts";
import { cn } from "@/lib/utils.ts";

interface PageVersionHistoryViewProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageId: string;
}

function VersionMeta({ descriptor }: { descriptor: PageSnapshotDescriptor }) {
  return (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {descriptor.blockCount} blocks · {descriptor.wordCount} words
    </span>
  );
}

function VersionList({
  descriptors,
  isLoading,
  onSelect,
  selectedId,
}: {
  descriptors: PageSnapshotDescriptor[];
  isLoading: boolean;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  if (descriptors.length === 0) {
    return (
      <p className="px-3 py-4 text-muted-foreground text-xs">
        {isLoading ? "Loading…" : "No saved versions yet."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2">
      {descriptors.map((descriptor) => (
        <button
          className={cn(
            "flex flex-col items-start gap-0.5 rounded-md px-2.5 py-1.5 text-left hover:bg-accent",
            descriptor.id === selectedId && "bg-accent"
          )}
          key={descriptor.id}
          onClick={() => onSelect(descriptor.id)}
          type="button"
        >
          <span className="truncate font-medium text-foreground text-xs">
            {formatRelativeTime(descriptor.timestamp)}
          </span>
          <VersionMeta descriptor={descriptor} />
        </button>
      ))}
    </div>
  );
}

/** Desktop full-view version history (list + read-only preview). Touch uses the sub-drawer. */
export function PageVersionHistoryView({
  onOpenChange,
  open,
  pageId,
}: PageVersionHistoryViewProps) {
  const { descriptors, isLoading: listLoading } = usePageSnapshots(
    pageId,
    open
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Default to the newest version; keep the current selection if it still exists.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      return;
    }
    setSelectedId((current) =>
      current && descriptors.some((descriptor) => descriptor.id === current)
        ? current
        : (descriptors[0]?.id ?? null)
    );
  }, [open, descriptors]);

  const selected = useMemo(
    () =>
      descriptors.find((descriptor) => descriptor.id === selectedId) ?? null,
    [descriptors, selectedId]
  );
  const { content, isLoading: contentLoading } = usePageSnapshotContent(
    pageId,
    selectedId
  );

  const handleRestore = () => {
    if (!selected) {
      return;
    }
    restorePageSnapshot(pageId, selected.id, selected.timestamp).catch(
      () => undefined
    );
    setConfirmOpen(false);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent
          className="flex h-[min(90vh,900px)] w-full max-w-[min(1100px,95vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,95vw)]"
          showCloseButton={false}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Preview and restore an earlier version of this page.
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Button
                aria-label="Close version history"
                onClick={() => onOpenChange(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <IconX aria-hidden />
              </Button>
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-sm">
                  {selected
                    ? formatRelativeTime(selected.timestamp)
                    : "Version history"}
                </span>
                {selected ? <VersionMeta descriptor={selected} /> : null}
              </div>
            </div>
            {selected ? (
              <Button
                onClick={() => setConfirmOpen(true)}
                size="sm"
                type="button"
              >
                <IconArrowBackUp aria-hidden />
                Restore this version
              </Button>
            ) : null}
          </div>

          <div className="flex min-h-0 flex-1">
            <SnapshotPreview
              content={content}
              isLoading={contentLoading}
              pageId={pageId}
            />
            <div className="min-h-0 w-72 shrink-0 overflow-y-auto border-l">
              <VersionList
                descriptors={descriptors}
                isLoading={listLoading}
                onSelect={setSelectedId}
                selectedId={selectedId}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Restore this version?</DialogTitle>
            <DialogDescription>
              The page reverts to its state from{" "}
              {selected ? formatRelativeTime(selected.timestamp) : ""}. Your
              current version is saved first, so you can undo this.
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
