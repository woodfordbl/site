"use client";

import { IconArrowBackUp, IconChevronLeft, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
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
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { formatRelativeTime } from "@/lib/pages/format-relative-time.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import type {
  PageSnapshotContent,
  PageSnapshotDescriptor,
} from "@/lib/pages/page-snapshot-types.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
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

function SnapshotTitleDisplay({
  icon,
  title,
}: {
  icon?: string;
  title: string;
}) {
  return (
    <div className={pageTitleEditorLayoutClassName}>
      <div className={pageTitleIconSlotClassName}>
        <PageIconDisplay
          className="size-8 sm:size-9 [&_[role=img]]:text-2xl sm:[&_[role=img]]:text-[1.5rem] [&_svg]:size-7"
          icon={icon}
        />
      </div>
      <div
        className={cn(
          "w-full min-w-0",
          headingSurfaceClassName,
          headingTypographyClassNames[1]
        )}
      >
        {title.trim() === "" ? DEFAULT_PAGE_TITLE : title}
      </div>
    </div>
  );
}

function SnapshotPreview({
  content,
  isLoading,
  pageId,
}: {
  content: PageSnapshotContent | null;
  isLoading: boolean;
  pageId: string;
}) {
  const { className: typographyClassName, ...typographyData } =
    pageContentTypographyProps({
      font: content?.settings.font ?? "default",
      smallText: content?.settings.smallText ?? false,
    });

  if (!content) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground text-sm">
        {isLoading ? "Loading version…" : "Select a version to preview."}
      </div>
    );
  }

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", typographyClassName)}
      {...typographyData}
    >
      <CanvasBlocksReadOnly
        blocks={content.blocks}
        mode="view"
        pageId={pageId}
        titleSlot={
          <SnapshotTitleDisplay icon={content.icon} title={content.title} />
        }
      />
    </div>
  );
}

export function PageVersionHistoryView({
  onOpenChange,
  open,
  pageId,
}: PageVersionHistoryViewProps) {
  const isNarrow = useIsNarrowViewport();
  const { descriptors, isLoading: listLoading } = usePageSnapshots(
    pageId,
    open
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "preview">("list");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Default to the newest version; keep the current selection if it still exists.
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setMobilePane("list");
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

  const previewActive = !isNarrow || mobilePane === "preview";
  const listActive = !isNarrow || mobilePane === "list";
  const canRestore = selected !== null && previewActive;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    if (isNarrow) {
      setMobilePane("preview");
    }
  };

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

  const contentClassName = cn(
    "flex w-full flex-col gap-0 overflow-hidden p-0",
    isNarrow
      ? "h-[100dvh] max-w-full rounded-none sm:max-w-full"
      : "h-[min(90vh,900px)] max-w-[min(1100px,95vw)] sm:max-w-[min(1100px,95vw)]"
  );

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className={contentClassName} showCloseButton={false}>
          <DialogHeader className="sr-only">
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Preview and restore an earlier version of this page.
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {isNarrow && mobilePane === "preview" ? (
                <Button
                  aria-label="Back to versions"
                  onClick={() => setMobilePane("list")}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconChevronLeft aria-hidden />
                </Button>
              ) : (
                <Button
                  aria-label="Close version history"
                  onClick={() => onOpenChange(false)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <IconX aria-hidden />
                </Button>
              )}
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-sm">
                  {previewActive && selected
                    ? formatRelativeTime(selected.timestamp)
                    : "Version history"}
                </span>
                {previewActive && selected ? (
                  <VersionMeta descriptor={selected} />
                ) : null}
              </div>
            </div>
            {canRestore ? (
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
            {previewActive ? (
              <SnapshotPreview
                content={content}
                isLoading={contentLoading}
                pageId={pageId}
              />
            ) : null}
            {listActive ? (
              <div
                className={cn(
                  "min-h-0 overflow-y-auto",
                  isNarrow ? "w-full" : "w-72 shrink-0 border-l"
                )}
              >
                <VersionList
                  descriptors={descriptors}
                  isLoading={listLoading}
                  onSelect={handleSelect}
                  selectedId={selectedId}
                />
              </div>
            ) : null}
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
