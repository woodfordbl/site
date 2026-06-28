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

interface PageLinkDeleteDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  /** Target page id when a nested page-link deletion is pending, else `null` (closed). */
  pageId: string | null;
}

/**
 * Confirmation shown when deleting a nested subpage `pageLink` block from the
 * canvas. Deleting the block deletes the page it points at (and its descendants),
 * so this mirrors the sidebar "Delete page?" dialog rather than silently removing
 * the link. @see docs/architecture/pages.md#page-links
 */
export function PageLinkDeleteDialog({
  pageId,
  onCancel,
  onConfirm,
}: PageLinkDeleteDialogProps) {
  const localPage = useLocalPageById(pageId ?? "");

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={pageId !== null}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete page?</DialogTitle>
          <DialogDescription>
            {localPage && localPage.serverBaselineHash === null
              ? "This page and its blocks will be removed. This cannot be undone."
              : "This page will be hidden locally. The published version will remain."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
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
