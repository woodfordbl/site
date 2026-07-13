import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  applyExternalContentChange,
  type ContentChangedEvent,
} from "@/lib/content/dev-disk/apply-external-change.ts";
import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";
import {
  hasPendingFlush,
  startDevDiskSync,
} from "@/lib/content/dev-disk/dev-disk-sync.ts";

/**
 * Dev disk mode's client wiring: starts the outbound flush engine and
 * subscribes to the content watcher's `site:content-changed` HMR events so
 * external edits (VS Code, git checkout) stream into open canvases live.
 * Renders nothing; dead code in production builds.
 */
export function DevContentSyncEffect() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!(isDevDiskMode() && import.meta.hot)) {
      return;
    }
    startDevDiskSync();

    const handler = (data: ContentChangedEvent) => {
      applyExternalContentChange(data, queryClient, {
        hasPendingFlush,
      }).catch(() => undefined);
    };
    import.meta.hot.on("site:content-changed", handler);
    return () => {
      import.meta.hot?.off("site:content-changed", handler);
    };
  }, [queryClient]);

  return null;
}
