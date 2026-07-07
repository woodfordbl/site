"use client";

import { type KeyboardEvent, useCallback } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { getDeletePageConfirmDescription } from "@/lib/pages/delete-page-confirm-copy.ts";

interface DeletePageConfirmDialogProps {
  description?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pageId?: string;
}

/**
 * Shared "Delete page?" confirmation. Enter confirms; Escape cancels (same as
 * Cancel). Used by the sidebar, page header menu, canvas page-link delete, and
 * the delete-page keyboard command.
 */
export function DeletePageConfirmDialog({
  description,
  onConfirm,
  onOpenChange,
  open,
  pageId,
}: DeletePageConfirmDialogProps) {
  const localPage = useLocalPageById(pageId ?? "");
  const resolvedDescription =
    description ?? (pageId ? getDeletePageConfirmDescription(localPage) : "");

  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        onConfirm();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleCancel();
      }
    },
    [handleCancel, onConfirm]
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent onKeyDownCapture={handleKeyDown} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete page?</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={handleCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
