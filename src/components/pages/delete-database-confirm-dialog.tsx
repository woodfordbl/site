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
          <DialogTitle>Delete database?</DialogTitle>
          <DialogDescription>
            {`"${databaseName}" and all of its rows will be permanently deleted. Linked database blocks will show as not found.`}
          </DialogDescription>
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
