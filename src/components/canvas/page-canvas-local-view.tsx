import { type ReactNode, useMemo } from "react";

import { CanvasBlocksReadOnly } from "@/components/canvas/page-canvas-server.tsx";
import { readBootstrapPageBlocks } from "@/db/queries/read-bootstrap-page-blocks.ts";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";

interface PageCanvasLocalViewProps {
  fullWidth: boolean;
  isNarrowViewport: boolean;
  serverPage: ServerPageSource;
  titleSlot?: ReactNode;
}

/**
 * Paints a dirty page's local blocks synchronously from localStorage, in the
 * main bundle, so refreshed local-first content shows before the editor chunk
 * loads. Falls back to server blocks if no local shard is present.
 */
export function PageCanvasLocalView({
  fullWidth,
  isNarrowViewport,
  serverPage,
  titleSlot,
}: PageCanvasLocalViewProps) {
  const blocks = useMemo(() => {
    const bootstrap = readBootstrapPageBlocks(serverPage.id);
    return bootstrap.hasLocal ? bootstrap.blocks : serverPage.blocks;
  }, [serverPage.id, serverPage.blocks]);

  return (
    <CanvasBlocksReadOnly
      blocks={blocks}
      fullWidth={fullWidth}
      isNarrowViewport={isNarrowViewport}
      pageId={serverPage.id}
      titleSlot={titleSlot}
    />
  );
}
