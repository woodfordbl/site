import { DeletePageConfirmDialog } from "@/components/pages/delete-page-confirm-dialog.tsx";

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
  return (
    <DeletePageConfirmDialog
      onConfirm={onConfirm}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={pageId !== null}
      pageId={pageId ?? undefined}
    />
  );
}
