"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useIsCoarsePrimaryPointer } from "@/components/layout/device-layout-provider.tsx";
import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { scheduleIdleCallback } from "@/lib/dom/schedule-idle-callback.ts";
import { collectInlineLinkHrefs } from "@/lib/media/collect-inline-link-hrefs.ts";
import { preloadInlineLinkPreviews } from "@/lib/media/preload-inline-link-previews.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface WarmInlineLinkPreviewsEffectProps {
  pageId: string;
  /** Fallback when the page has not been seeded into local collections yet. */
  serverBlocks: Block[];
}

/**
 * Idle-preload OG metadata for inline links on the open page so hover hits a
 * warm TanStack Query cache. Scoped to this page only; capped concurrency.
 */
export function WarmInlineLinkPreviewsEffect({
  pageId,
  serverBlocks,
}: WarmInlineLinkPreviewsEffectProps) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const queryClient = useQueryClient();
  const { blocks, hasSeededBlocks } = usePageBlocks(pageId);
  const sourceBlocks =
    hasSeededBlocks && blocks.length > 0 ? blocks : serverBlocks;
  const hrefs = useMemo(
    () => collectInlineLinkHrefs(sourceBlocks),
    [sourceBlocks]
  );

  useEffect(() => {
    if (isCoarsePointer || hrefs.length === 0) {
      return;
    }

    const abort = new AbortController();
    const cancelIdle = scheduleIdleCallback(
      () => {
        preloadInlineLinkPreviews(queryClient, hrefs, {
          signal: abort.signal,
        }).catch(() => {
          /* individual prefetch errors ignored */
        });
      },
      { timeout: 2500 }
    );

    return () => {
      abort.abort();
      cancelIdle();
    };
  }, [hrefs, isCoarsePointer, queryClient]);

  return null;
}
