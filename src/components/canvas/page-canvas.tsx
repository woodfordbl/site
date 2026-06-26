import { type ComponentType, type ReactNode, useEffect, useState } from "react";

import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

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

type PageCanvasEditorComponent = ComponentType<PageCanvasProps>;

function PageCanvasClient(props: PageCanvasProps) {
  const [Editor, setEditor] = useState<PageCanvasEditorComponent | null>(null);

  useEffect(() => {
    import("./page-canvas-editor.tsx")
      .then((module) => {
        setEditor(() => module.PageCanvasEditor);
      })
      .catch(() => {
        /* client-only editor bundle */
      });
  }, []);

  const serverFallback = (
    <PageCanvasServer
      serverPage={props.serverPage}
      titleSlot={props.titleSlot}
    />
  );

  if (!Editor) {
    return serverFallback;
  }

  return <Editor {...props} />;
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
    <PageCanvasClient
      footerHost={footerHost}
      headerSlot={headerSlot}
      pageHasLocalDraft={pageHasLocalDraft}
      serverPage={serverPage}
      titleSlot={titleSlot}
    />
  );
}
