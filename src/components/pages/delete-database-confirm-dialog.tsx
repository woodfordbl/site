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

interface DeleteDatabaseConfirmDialogProps {
  databaseName: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Shared "Delete database?" confirmation for sidebar overflow and context
 * menus. Enter confirms; Escape cancels (same as Cancel).
 */
export function DeleteDatabaseConfirmDialog({
  databaseName,
  onConfirm,
  onOpenChange,
  open,
}: DeleteDatabaseConfirmDialogProps) {
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
          <DialogTitle>Delete database?</DialogTitle>
          <DialogDescription>
            {`"${databaseName}" and all of its rows will be permanently deleted. Linked database blocks will show as not found.`}
          </DialogDescription>
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
