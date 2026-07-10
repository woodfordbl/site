import type { KeyboardEventHandler } from "react";

interface ConfirmDialogKeyDownOptions {
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Capture-phase key handler for binary confirm dialogs: Enter confirms,
 * Escape cancels (same as Cancel). Attach to `DialogContent`.
 */
export function createConfirmDialogKeyDownHandler({
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: ConfirmDialogKeyDownOptions): KeyboardEventHandler<HTMLDivElement> {
  return (event) => {
    if (event.key === "Enter") {
      if (confirmDisabled) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onConfirm();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };
}
