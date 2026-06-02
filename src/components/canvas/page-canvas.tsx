import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

import { PageCanvasEditor } from "./page-canvas-editor.tsx";
import { PageCanvasServer } from "./page-canvas-server.tsx";

interface PageCanvasProps {
  pageHasLocalDraft: boolean;
  serverPage: ServerPageSource;
}

export function PageCanvas({ pageHasLocalDraft, serverPage }: PageCanvasProps) {
  const isClient = useIsClient();

  if (!isClient) {
    if (pageHasLocalDraft) {
      return null;
    }

    return <PageCanvasServer serverPage={serverPage} />;
  }

  return <PageCanvasEditor serverPage={serverPage} />;
}
