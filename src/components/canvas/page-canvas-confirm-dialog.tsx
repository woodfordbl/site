import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  PAGE_CANVAS_CONFIRM_DIALOG_COPY,
  type PageCanvasConfirmAction,
} from "@/hooks/use-page-canvas-footer-actions.ts";

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
  return (
    <Dialog onOpenChange={onOpenChange} open={confirmAction !== null}>
      <DialogContent showCloseButton={false}>
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
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button" variant="destructive">
            {confirmAction
              ? PAGE_CANVAS_CONFIRM_DIALOG_COPY[confirmAction].confirmLabel
              : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
