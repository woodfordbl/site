import type { ReactNode } from "react";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import type { TopLevelBlockAlign } from "@/lib/canvas/top-level-row-align.ts";

interface PageCanvasAccessViewProps {
  coverSlot?: ReactNode;
  fullWidth: boolean;
  headerSlot?: ReactNode;
  isNarrowViewport: boolean;
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
  topLevelBlockAlign?: TopLevelBlockAlign;
}

/**
 * Live read-only canvas for a page the current user cannot edit (my_access
 * level below `edit`). Blocks stream from the synced blocks collection, so
 * teammates' edits keep painting; `mode="view"` renders each block's read-only
 * `View` component — no `contentEditable`, no gutters, no add-block
 * affordances. Replaces the lazily-loaded editor entirely (the editor chunk is
 * never imported while the page is read-only — see page-canvas.tsx).
 */
export function PageCanvasAccessView({
  coverSlot,
  fullWidth,
  headerSlot,
  isNarrowViewport,
  serverPage,
  titleSlot,
  topLevelBlockAlign,
}: PageCanvasAccessViewProps) {
  const { blocks, isReady } = usePageBlocks(serverPage.id);
  const resolvedBlocks =
    isReady || blocks.length > 0 ? blocks : serverPage.blocks;

  return (
    <CanvasBlocksReadOnly
      blocks={resolvedBlocks}
      coverSlot={coverSlot}
      fullWidth={fullWidth}
      headerSlot={headerSlot}
      isNarrowViewport={isNarrowViewport}
      mode="view"
      pageId={serverPage.id}
      titleSlot={titleSlot}
      topLevelBlockAlign={topLevelBlockAlign}
    />
  );
}
