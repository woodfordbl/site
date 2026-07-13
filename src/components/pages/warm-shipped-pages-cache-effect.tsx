"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { loadAllPages } from "@/lib/content/load-all-pages.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import { scheduleIdleCallback } from "@/lib/dom/schedule-idle-callback.ts";

const MAX_WARM_ATTEMPTS = 3;
const RETRY_DELAY_MS = 30_000;

let warmedThisSession = false;

/** Test-only: reset the once-per-session guard. */
export function resetWarmShippedPagesForTests(): void {
  warmedThisSession = false;
}

/**
 * Once a visitor has any local workspace data (they edited something — the
 * "local-first mode" signal), idle-prefetch every shipped page body into the
 * per-slug React Query caches. Loaders `ensureQueryData` with
 * `staleTime: Infinity`, so after the warm-up all shipped-page navigation is
 * served from cache — no per-page server round trips for editors, and pristine
 * pages still track deploys (the catalog-revision effect invalidates `["pages"]`
 * on a new deploy, dropping this warm data along with everything else).
 *
 * Clean first-time visitors never trigger this — they stay on plain per-page
 * SSR + loader fetches.
 */
export function WarmShippedPagesCacheEffect() {
  const queryClient = useQueryClient();
  const hasLocalWorkspace = useLocalPages().length > 0;

  useEffect(() => {
    if (warmedThisSession || !hasLocalWorkspace) {
      return;
    }
    warmedThisSession = true;

    let cancelIdle: (() => void) | undefined;
    let retryTimer: number | undefined;

    // The effect deps never change once local data exists, so a failed fetch
    // cannot rely on a re-run — retry here (bounded) instead.
    const attempt = (attemptsLeft: number) => {
      cancelIdle = scheduleIdleCallback(() => {
        loadAllPages()
          .then((pages) => {
            for (const page of pages) {
              // The index route queries home as the literal "home" slug;
              // everything else keys by the page's leading-slash slug (`/$`).
              const querySlug = page.slug === "/" ? "home" : page.slug;
              queryClient.setQueryData(
                pageBySlugQueryOptions(querySlug).queryKey,
                page
              );
            }
          })
          .catch(() => {
            if (attemptsLeft > 1) {
              retryTimer = window.setTimeout(() => {
                attempt(attemptsLeft - 1);
              }, RETRY_DELAY_MS);
              return;
            }
            // Out of retries — navigation falls back to per-page fetches.
            warmedThisSession = false;
          });
      });
    };

    attempt(MAX_WARM_ATTEMPTS);

    return () => {
      cancelIdle?.();
      window.clearTimeout(retryTimer);
    };
  }, [hasLocalWorkspace, queryClient]);

  return null;
}
