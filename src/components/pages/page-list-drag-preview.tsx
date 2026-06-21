import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import { pageListRowPadding } from "@/lib/pages/page-list-preview-depth.ts";
import { cn } from "@/lib/utils.ts";

export interface PageListDragPreviewState {
  clientX: number;
  clientY: number;
  depth: number;
  icon?: string;
  offsetX: number;
  offsetY: number;
  pageId: string;
  title: string;
  width: number;
}

export function PageListDragPreview({
  preview,
}: {
  preview: PageListDragPreviewState;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-9999 flex h-7 items-center gap-0 rounded-lg bg-background font-normal text-[0.8rem] shadow-md",
        pageListRowPadding(preview.depth)
      )}
      data-page-list-drag-preview=""
      style={{
        // Compositor-only positioning: transform avoids layout/paint per pointer move.
        transform: `translate3d(${preview.clientX - preview.offsetX}px, ${preview.clientY - preview.offsetY}px, 0)`,
        width: preview.width,
      }}
    >
      <span className={iconSlotClassName("icon-xs")}>
        <PageIconDisplay icon={preview.icon} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{preview.title}</span>
    </div>
  );
}
