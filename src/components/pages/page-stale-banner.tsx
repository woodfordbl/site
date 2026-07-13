"use client";

import { IconInfoCircle } from "@tabler/icons-react";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";
import { keepLocalPageVersion } from "@/lib/pages/keep-local-page-version.ts";
import { mergeStalePageFromServer } from "@/lib/pages/merge-stale-page-from-server.ts";
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

function mergeSuccessMessage(outcome: {
  tookRemote: number;
  conflicts: number;
  changed: boolean;
}): string {
  if (!outcome.changed) {
    return "Already up to date — kept your edits.";
  }
  const changes = `Merged ${outcome.tookRemote} site ${
    outcome.tookRemote === 1 ? "change" : "changes"
  }`;
  if (outcome.conflicts === 0) {
    return `${changes}.`;
  }
  return `${changes}; kept your version of ${outcome.conflicts} conflicting ${
    outcome.conflicts === 1 ? "block" : "blocks"
  }.`;
}

/**
 * Conflict strip for a locally-edited shipped page whose shipped content
 * changed since the overlay was seeded. Resolutions: merge the site changes
 * into the local edits (three-way, local wins on conflicts — the default),
 * preview the site version, keep the local edits (fast-forward the baseline),
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
  const [merging, setMerging] = useState(false);

  const { isStale } = computePageStaleState(serverPage, localPage);

  // Dev disk mode has no shipped-vs-local split — disk is the source of
  // truth and edits flush continuously, so staleness is never actionable.
  if (isDevDiskMode() || !(isClient && isStale)) {
    return null;
  }

  const handleMerge = async () => {
    setMerging(true);
    try {
      const outcome = await mergeStalePageFromServer(serverPage);
      if (outcome.status === "no-baseline") {
        toast.info(
          "No merge base is stored for this page — use Preview to compare, then keep or replace your edits."
        );
        return;
      }
      if (outcome.status === "no-local") {
        return;
      }
      if (outcome.changed) {
        onAfterReset();
      }
      toast.success(mergeSuccessMessage(outcome));
    } catch (error) {
      reportPersistenceError(error);
    } finally {
      setMerging(false);
    }
  };

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
          variant="ghost"
        >
          Use site version
        </Button>
        <Button
          disabled={merging}
          onClick={() => {
            handleMerge().catch(() => undefined);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Merge site changes
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
