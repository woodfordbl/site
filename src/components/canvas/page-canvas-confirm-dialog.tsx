import { ConfirmDialogFooter } from "@/components/ui/confirm-dialog-footer.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  PAGE_CANVAS_CONFIRM_DIALOG_COPY,
  type PageCanvasConfirmAction,
} from "@/hooks/use-page-canvas-footer-actions.ts";
import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";

interface PageCanvasConfirmDialogProps {
  confirmAction: PageCanvasConfirmAction | null;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}

export function PageCanvasConfirmDialog({
  confirmAction,
  onConfirm,
  onOpenChange,
}: PageCanvasConfirmDialogProps) {
  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={confirmAction !== null}>
      <DialogContent
        onKeyDownCapture={createConfirmDialogKeyDownHandler({
          onCancel: handleCancel,
          onConfirm,
        })}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            {confirmAction
              ? PAGE_CANVAS_CONFIRM_DIALOG_COPY[confirmAction].title
              : ""}
          </DialogTitle>
          <DialogDescription>
            {confirmAction
              ? PAGE_CANVAS_CONFIRM_DIALOG_COPY[confirmAction].description
              : ""}
          </DialogDescription>
        </DialogHeader>
        <ConfirmDialogFooter
          confirmLabel={
            confirmAction
              ? PAGE_CANVAS_CONFIRM_DIALOG_COPY[confirmAction].confirmLabel
              : ""
          }
          confirmVariant="destructive"
          onCancel={handleCancel}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
