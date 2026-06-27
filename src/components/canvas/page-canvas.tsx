import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";

import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import type { Block } from "@/lib/schemas/block.ts";

import { PageCanvasLocalView } from "./page-canvas-local-view.tsx";
import {
  CanvasBlocksReadOnly,
  PageCanvasServer,
} from "./page-canvas-server.tsx";

/** Stable empty block list for the local-first SSR placeholder. */
const NO_BLOCKS: Block[] = [];

interface PageCanvasProps {
  /** Rendered at the very top of the scroll region (full-bleed page cover image). */
  coverSlot?: ReactNode;
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
        serverPage={props.serverPage}
        titleSlot={props.titleSlot}
      />
    );
  }

  return (
    <PageCanvasServer
      coverSlot={props.coverSlot}
      serverPage={props.serverPage}
      titleSlot={props.titleSlot}
    />
  );
}

export function PageCanvas({
  coverSlot,
  headerSlot,
  pageHasLocalDraft,
  serverPage,
  titleSlot,
}: PageCanvasProps) {
  const isClient = useIsClient();

  if (!isClient) {
    // #region agent log
    if (typeof window !== "undefined") {
      fetch(
        "http://127.0.0.1:7470/ingest/098618e1-bf18-4afe-b4fc-70958180656a",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "a3ab7e",
          },
          body: JSON.stringify({
            sessionId: "a3ab7e",
            hypothesisId: "H_PC2",
            location: "page-canvas.tsx:PageCanvas(!isClient)",
            message: "SSR/hydration branch",
            data: {
              pageId: serverPage.id,
              pageHasLocalDraft,
              serverBlocks: serverPage.blocks.length,
              rendered: pageHasLocalDraft ? "empty-placeholder" : "server",
            },
            timestamp: Date.now(),
          }),
        }
      ).catch(() => {
        /* debug */
      });
    }
    // #endregion

    // First-time/clean visitors get full SSR content. For locally-edited pages,
    // skip server blocks entirely so the browser never paints a stale server
    // frame before the client swaps in local-first content (TanStack DB).
    if (pageHasLocalDraft) {
      return (
        <CanvasBlocksReadOnly
          blocks={NO_BLOCKS}
          coverSlot={coverSlot}
          pageId={serverPage.id}
          titleSlot={titleSlot}
        />
      );
    }

    return (
      <PageCanvasServer
        coverSlot={coverSlot}
        serverPage={serverPage}
        titleSlot={titleSlot}
      />
    );
  }

  return (
    <PageCanvasClient
      coverSlot={coverSlot}
      headerSlot={headerSlot}
      pageHasLocalDraft={pageHasLocalDraft}
      serverPage={serverPage}
      titleSlot={titleSlot}
    />
  );
}
