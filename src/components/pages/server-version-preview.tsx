"use client";

import { IconCheck, IconX } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { SnapshotPreview } from "@/components/pages/snapshot-preview.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialogFooter } from "@/components/ui/confirm-dialog-footer.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";
import { createPreviewResolutionKeyDownHandler } from "@/lib/dialog/preview-resolution-keys.ts";
import { keepLocalPageVersion } from "@/lib/pages/keep-local-page-version.ts";
import type { PageSnapshotContent } from "@/lib/pages/page-snapshot-types.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";
import type { Page } from "@/lib/schemas/page.ts";

interface ServerVersionPreviewProps {
  onExit: () => void;
  /** Bumped after "Use site version" clears local state so the canvas remounts. */
  onReset: () => void;
  serverPage: Page;
}

/**
 * Takes over the page workspace with a read-only render of the current shipped
 * (site) version of a stale locally-edited page — same takeover pattern as
 * `PageVersionPreview`, fed from the loader's server page instead of a
 * snapshot. Resolution actions mirror the stale banner.
 */
export function ServerVersionPreview({
  onExit,
  onReset,
  serverPage,
}: ServerVersionPreviewProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const showShortcuts = !isCoarsePointer;

  const content = useMemo<PageSnapshotContent>(
    () => ({
      id: `server-version:${serverPage.id}`,
      blockOrder: serverPage.blocks.map((block) => block.id),
      blocks: serverPage.blocks,
      icon: serverPage.icon,
      settings: {
        font: serverPage.font,
        textScale: serverPage.textScale,
      },
      title: serverPage.title,
    }),
    [serverPage]
  );

  const handleCancel = () => {
    setConfirmOpen(false);
  };

  const handleKeepMine = () => {
    keepLocalPageVersion(serverPage);
    onExit();
  };

  const handleUseSiteVersion = () => {
    resetPageToRemote(serverPage.id);
    setConfirmOpen(false);
    onReset();
  };

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onKeyDownCapture={createPreviewResolutionKeyDownHandler({
        disabled: confirmOpen,
        onKeep: handleKeepMine,
        onUseSiteVersion: () => {
          setConfirmOpen(true);
        },
      })}
    >
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-3">
        <Button onClick={onExit} size="sm" type="button" variant="ghost">
          <IconX aria-hidden />
          Exit
        </Button>
        <span className="truncate text-muted-foreground text-sm">
          Viewing site version
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Button
            onClick={handleKeepMine}
            size="sm"
            type="button"
            variant="ghost"
          >
            Keep my edits
            {showShortcuts ? (
              <Kbd data-icon="inline-end" variant="inherit">
                K
              </Kbd>
            ) : null}
          </Button>
          <Button
            onClick={() => {
              setConfirmOpen(true);
            }}
            size="sm"
            type="button"
          >
            <IconCheck aria-hidden />
            Use site version
            {showShortcuts ? (
              <Kbd data-icon="inline-end" variant="inherit">
                U
              </Kbd>
            ) : null}
          </Button>
        </span>
      </div>

      <SnapshotPreview
        content={content}
        isLoading={false}
        pageId={serverPage.id}
      />

      <Dialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <DialogContent
          onKeyDownCapture={createConfirmDialogKeyDownHandler({
            onCancel: handleCancel,
            onConfirm: handleUseSiteVersion,
          })}
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Use the site version?</DialogTitle>
            <DialogDescription>
              Your local edits on this page will be removed and the shipped site
              version restored. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <ConfirmDialogFooter
            confirmLabel="Use site version"
            confirmVariant="destructive"
            onCancel={handleCancel}
            onConfirm={handleUseSiteVersion}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
