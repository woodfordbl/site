import type { ReactNode } from "react";

import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

import { PageCanvasEditor } from "./page-canvas-editor.tsx";
import { PageCanvasServer } from "./page-canvas-server.tsx";

interface PageCanvasProps {
  footerHost?: HTMLElement | null;
  pageHasLocalDraft: boolean;
  serverPage: ServerPageSource;
  /** Rendered at the top of the scroll region, above the blocks (page title). */
  titleSlot?: ReactNode;
}

export function PageCanvas({
  footerHost,
  pageHasLocalDraft: _pageHasLocalDraft,
  serverPage,
  titleSlot,
}: PageCanvasProps) {
  const isClient = useIsClient();

  if (!isClient) {
    // Dirty pages render the server baseline too: the local draft swaps in
    // after hydration, keeping the layout stable instead of flashing a blank
    // content area (and crawlers always see real content).
    return <PageCanvasServer serverPage={serverPage} titleSlot={titleSlot} />;
  }

  return (
    <PageCanvasEditor
      footerHost={footerHost}
      serverPage={serverPage}
      titleSlot={titleSlot}
    />
  );
}
