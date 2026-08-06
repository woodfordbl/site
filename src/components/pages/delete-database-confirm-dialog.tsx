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
  databaseNames: string[];
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

const CASCADE_COPY = "Linked blocks and the database page will be removed too.";

function describeDatabases(names: string[]): {
  description: string;
  title: string;
} {
  const subject =
    names.length === 0
      ? "This database"
      : names.map((name) => `"${name}"`).join(", ");

  if (names.length > 1) {
    return {
      description: `${subject} and their rows will be permanently deleted. ${CASCADE_COPY}`,
      title: `Delete ${names.length} databases?`,
    };
  }

  return {
    description: `${subject} and its rows will be permanently deleted. ${CASCADE_COPY}`,
    title: "Delete database?",
  };
}

/**
 * Shared "Delete database?" confirmation for the sidebar overflow and context
 * menus and for deleting a `database` block from a page canvas. Enter
 * confirms; Escape cancels (same as Cancel). Multiple names describe a canvas
 * selection that spans more than one linked database.
 */
export function DeleteDatabaseConfirmDialog({
  databaseNames,
  onConfirm,
  onOpenChange,
  open,
}: DeleteDatabaseConfirmDialogProps) {
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const { description, title } = describeDatabases(databaseNames);

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
