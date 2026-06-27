import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";

import { PageCanvasLocalView } from "./page-canvas-local-view.tsx";
import { PageCanvasServer } from "./page-canvas-server.tsx";

interface PageCanvasProps {
  /** Rendered at the very top of the scroll region (full-bleed page cover image). */
  coverSlot?: ReactNode;
  fullWidth: boolean;
  /** Rendered flush at the top of the scroll region so it scrolls with content (mobile header). */
  headerSlot?: ReactNode;
  isNarrowViewport: boolean;
  pageHasLocalDraft: boolean;
  serverPage: ServerPageSource;
  /** Rendered at the top of the scroll region, above the blocks (page title). */
  titleSlot?: ReactNode;
}

type PageCanvasEditorComponent = ComponentType<PageCanvasProps>;

function PageCanvasClient(props: PageCanvasProps) {
  const [Editor, setEditor] = useState<PageCanvasEditorComponent | null>(null);
  // Dirty pages render the synchronous local view on the first client render so
  // the stale server frame is never shown (SSR also skips server blocks for
  // these pages — see PageCanvas below).
  const [showLocal, setShowLocal] = useState(props.pageHasLocalDraft);

  useLayoutEffect(() => {
    if (props.pageHasLocalDraft) {
      setShowLocal(true);
    }
  }, [props.pageHasLocalDraft]);

  useEffect(() => {
    import("./page-canvas-editor.tsx")
      .then((module) => {
        setEditor(() => module.PageCanvasEditor);
      })
      .catch(() => {
        /* client-only editor bundle */
      });
  }, []);

  if (Editor) {
    return <Editor {...props} />;
  }

  if (showLocal) {
    return (
      <PageCanvasLocalView
        coverSlot={props.coverSlot}
        fullWidth={props.fullWidth}
        headerSlot={props.headerSlot}
        isNarrowViewport={props.isNarrowViewport}
        serverPage={props.serverPage}
        titleSlot={props.titleSlot}
      />
    );
  }

  return (
    <PageCanvasServer
      coverSlot={props.coverSlot}
      fullWidth={props.fullWidth}
      headerSlot={props.headerSlot}
      isNarrowViewport={props.isNarrowViewport}
      serverPage={props.serverPage}
      titleSlot={props.titleSlot}
    />
  );
}

export function PageCanvas({
  coverSlot,
  fullWidth,
  headerSlot,
  isNarrowViewport,
  pageHasLocalDraft,
  serverPage,
  titleSlot,
}: PageCanvasProps) {
  const isClient = useIsClient();

  if (!isClient) {
    // First-time/clean visitors get full SSR content. Locally-edited pages are
    // rendered purely client-side from local (TanStack DB): emit NO SSR content
    // at all (no server title/icon, no placeholder body) so the browser never
    // paints any server frame for a dirty page. @see docs/architecture/local-first-persistence.md
    if (pageHasLocalDraft) {
      return null;
    }

    return (
      <PageCanvasServer
        coverSlot={coverSlot}
        fullWidth={fullWidth}
        headerSlot={headerSlot}
        isNarrowViewport={isNarrowViewport}
        serverPage={serverPage}
        titleSlot={titleSlot}
      />
    );
  }

  return (
    <PageCanvasClient
      coverSlot={coverSlot}
      fullWidth={fullWidth}
      headerSlot={headerSlot}
      isNarrowViewport={isNarrowViewport}
      pageHasLocalDraft={pageHasLocalDraft}
      serverPage={serverPage}
      titleSlot={titleSlot}
    />
  );
}
