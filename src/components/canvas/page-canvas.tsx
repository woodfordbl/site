import type { ReactNode } from "react";

import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

import { PageCanvasEditor } from "./page-canvas-editor.tsx";
import { PageCanvasServer } from "./page-canvas-server.tsx";

interface PageCanvasProps {
  footerHost?: HTMLElement | null;
  /** Rendered flush at the top of the scroll region so it scrolls with content (mobile header). */
  headerSlot?: ReactNode;
  pageHasLocalDraft: boolean;
  serverPage: ServerPageSource;
  /** Rendered at the top of the scroll region, above the blocks (page title). */
  titleSlot?: ReactNode;
}

export function PageCanvas({
  footerHost,
  headerSlot,
  pageHasLocalDraft,
  serverPage,
  titleSlot,
}: PageCanvasProps) {
  const isClient = useIsClient();

  if (!isClient) {
    return <PageCanvasServer serverPage={serverPage} titleSlot={titleSlot} />;
  }

  return (
    <PageCanvasEditor
      footerHost={footerHost}
      headerSlot={headerSlot}
      pageHasLocalDraft={pageHasLocalDraft}
      serverPage={serverPage}
      titleSlot={titleSlot}
    />
  );
}
