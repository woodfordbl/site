import { Button } from "@/components/ui/button.tsx";
import { DialogFooter } from "@/components/ui/dialog.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";

interface ConfirmDialogFooterProps {
  confirmDisabled?: boolean;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Cancel + confirm footer for binary dialogs. Shows Esc / ↵ hints on fine
 * pointers; Enter confirms and Escape cancels via `createConfirmDialogKeyDownHandler`.
 */
export function ConfirmDialogFooter({
  confirmDisabled = false,
  confirmLabel,
  confirmVariant = "destructive",
  onCancel,
  onConfirm,
}: ConfirmDialogFooterProps) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  const showShortcuts = !isCoarsePointer;

  return (
    <DialogFooter>
      <Button onClick={onCancel} size="sm" type="button" variant="ghost">
        Cancel
        {showShortcuts ? (
          <Kbd data-icon="inline-end" variant="default">
            Esc
          </Kbd>
        ) : null}
      </Button>
      <Button
        disabled={confirmDisabled}
        onClick={onConfirm}
        size="sm"
        type="button"
        variant={confirmVariant}
      >
        {confirmLabel}
        {showShortcuts ? (
          <Kbd data-icon="inline-end" variant="default">
            ↵
          </Kbd>
        ) : null}
      </Button>
    </DialogFooter>
  );
}
