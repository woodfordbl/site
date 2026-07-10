"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { keepLocalPageVersion } from "@/lib/pages/keep-local-page-version.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";
import { computePageStaleState } from "@/lib/pages/resolve-page-state.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Live-collection read of one local page. Deliberately NOT `useLocalPageById`:
 * that hook merges the SSR preview cookie (fabricated baseline hashes → false
 * stale positives) and a mount-time localStorage bootstrap memo (a resolved
 * conflict would keep the banner alive until reload). Staleness must track the
 * live overlay only — including its deletion.
 */
function useLiveLocalPageById(pageId: string): LocalPage | null {
  const snapshotRef = useRef<LocalPage | null>(null);

  const readRow = useCallback(
    (): LocalPage | null =>
      localPagesCollection.toArray.find((page) => page.id === pageId) ?? null,
    [pageId]
  );

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      snapshotRef.current = readRow();

      const subscription = localPagesCollection.subscribeChanges(() => {
        snapshotRef.current = readRow();
        onStoreChange();
      });

      if (localPagesCollection.isReady()) {
        snapshotRef.current = readRow();
        onStoreChange();
      }

      return () => subscription.unsubscribe();
    },
    [readRow]
  );

  const getSnapshot = useCallback(() => snapshotRef.current, []);
  const getServerSnapshot = useCallback(() => null, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

interface PageStaleBannerProps {
  /** Bumped after "Use site version" clears local state so the canvas remounts. */
  onAfterReset: () => void;
  /** Opens the read-only site-version preview takeover. */
  onPreview: () => void;
  serverPage: Page;
}

/**
 * Conflict strip for a locally-edited shipped page whose shipped content
 * changed since the overlay was seeded. Offers the three v1 resolutions:
 * keep the local edits (fast-forward the baseline), preview the site version,
 * or replace the local edits with the site version.
 *
 * Client-only by design: staleness is judged from real localStorage overlay
 * data, never from the SSR preview cookie (which fabricates metadata), so SSR
 * and the hydration frame render nothing.
 */
export function PageStaleBanner({
  onAfterReset,
  onPreview,
  serverPage,
}: PageStaleBannerProps) {
  const isClient = useIsClient();
  const localPage = useLiveLocalPageById(serverPage.id);
  const [confirmReset, setConfirmReset] = useState(false);

  const { isStale } = computePageStaleState(serverPage, localPage);

  if (!(isClient && isStale)) {
    return null;
  }

  const handleKeepMine = () => {
    keepLocalPageVersion(serverPage);
  };

  const handleConfirmReset = () => {
    resetPageToRemote(serverPage.id);
    setConfirmReset(false);
    onAfterReset();
  };

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-border border-b bg-muted/50 px-4 py-2 text-sm"
      role="status"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <IconInfoCircle aria-hidden className="size-4 shrink-0" />
        <span className="truncate">
          This page changed on the site since you edited it.
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        <Button onClick={onPreview} size="sm" type="button" variant="ghost">
          Preview site version
        </Button>
        <Button
          onClick={handleKeepMine}
          size="sm"
          type="button"
          variant="ghost"
        >
          Keep my edits
        </Button>
        <Button
          onClick={() => {
            setConfirmReset(true);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Use site version
        </Button>
      </span>

      <PageCanvasConfirmDialog
        confirmAction={confirmReset ? "reset" : null}
        onConfirm={handleConfirmReset}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmReset(false);
          }
        }}
      />
    </div>
  );
}
