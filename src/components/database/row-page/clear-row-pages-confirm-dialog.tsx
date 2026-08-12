"use client";

import { useCallback } from "react";

import { ConfirmDialogFooter } from "@/components/ui/confirm-dialog-footer.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";

interface ClearRowPagesConfirmDialogProps {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** How many materialized row pages will be wiped. */
  pageCount: number;
}

/**
 * Destructive confirm before wiping materialized row pages so they re-seed
 * from the current template on next open. Enter confirms; Escape cancels.
 */
export function ClearRowPagesConfirmDialog({
  pageCount,
  onConfirm,
  onOpenChange,
  open,
}: ClearRowPagesConfirmDialogProps) {
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const pageLabel = pageCount === 1 ? "1 row page" : `${pageCount} row pages`;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        onKeyDownCapture={createConfirmDialogKeyDownHandler({
          onCancel: handleCancel,
          onConfirm,
        })}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>Clear {pageLabel}?</DialogTitle>
          <DialogDescription>
            Already-opened row pages keep their old body until cleared. Clearing
            removes covers and body edits on those pages; each row re-seeds from
            this template the next time it is opened. Row property values are
            kept. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ConfirmDialogFooter
          confirmLabel={pageCount === 1 ? "Clear row page" : "Clear row pages"}
          confirmVariant="destructive"
          onCancel={handleCancel}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
