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
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";
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
          <DialogTitle>Delete page?</DialogTitle>
          <DialogDescription>{resolvedDescription}</DialogDescription>
        </DialogHeader>
        <ConfirmDialogFooter
          confirmLabel="Delete"
          confirmVariant="destructive"
          onCancel={handleCancel}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
