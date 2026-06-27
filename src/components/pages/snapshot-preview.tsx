"use client";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import type { PageSnapshotContent } from "@/lib/pages/page-snapshot-types.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import { cn } from "@/lib/utils.ts";

/** Read-only page title row for a snapshot preview (mirrors the editable title layout). */
export function SnapshotTitleDisplay({
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

/** Read-only render of a snapshot's full page state (title + blocks), honoring its typography. */
export function SnapshotPreview({
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
