"use client";

import { IconRestore } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";

import { ConfirmDialogFooter } from "@/components/ui/confirm-dialog-footer.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import {
  localBlocksCollection,
  localDatabaseRowsCollection,
} from "@/db/collections/local-collections.ts";
import { useLocalDatabasesSnapshot } from "@/hooks/use-local-databases.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { clearDatabaseRowPage } from "@/lib/databases/clear-database-row-pages.ts";
import { databaseRowNavTarget } from "@/lib/databases/database-page-paths.ts";
import { databaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { createConfirmDialogKeyDownHandler } from "@/lib/dialog/confirm-dialog-keys.ts";
import { isLocallyDeletedPage } from "@/lib/schemas/local-page.ts";
import { appToast } from "@/lib/toast/app-toast.ts";
import { TOAST_ID_CLEAR_ROW_PAGES } from "@/lib/toast/toast-ids.ts";

/**
 * @fileoverview The way back from a customized row page.
 *
 * Editing a row page copies the template and stops following it. Nothing on
 * the page said so: it looked like any other page, and the only undo lived in
 * the template editor's sidebar, which is not where someone who just
 * customized a row would think to look. So the page's own ⋯ menu offers it.
 *
 * The item and the dialog are separate exports on purpose. A menu item that
 * owns its own dialog never gets to show it — selecting the item closes the
 * menu, the menu's content unmounts, and the dialog goes with it. So the host
 * keeps the open state and renders the dialog as a sibling of the menu, which
 * is what the delete confirm beside it already does.
 */

export interface ResetRowPageTarget {
  databaseName: string;
  /** Discards the page and relinks the row to the shared template. */
  reset: () => void;
}

/**
 * The reset this page offers, or `null` when it offers none — anything that is
 * not a row page, and any row page whose database has no template to go back
 * to. Offering it there would promise a body that does not exist.
 */
export function useResetRowPageTarget(
  pageId: string
): ResetRowPageTarget | null {
  const page = useLocalPageById(pageId);
  const source = page?.databaseRowSource;
  const databaseId = source?.databaseId ?? "";
  // The snapshot read, not `useDatabase`: this hook runs inside the page
  // header, which renders on every page during SSR, and `useLiveQuery` has no
  // server snapshot — reading it there aborts the whole server render.
  const database = useLocalDatabasesSnapshot().find(
    (entry) => entry.id === databaseId
  );
  // The template's *page record*, not `useRowTemplate`: whether a template
  // exists is all this decides, and reading its blocks would mean a
  // `useLiveQuery` on the SSR render path — the same "Missing
  // getServerSnapshot" abort that drops the whole site to client rendering.
  const templateRecord = useLocalPageById(databaseTemplatePageId(databaseId));
  const hasTemplate = Boolean(
    databaseId && templateRecord && !isLocallyDeletedPage(templateRecord)
  );
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const navigate = useNavigate();
  const databaseName = database?.name;
  const rowId = source?.rowId;

  const reset = useCallback(() => {
    if (!(database && rowId && databaseName)) {
      return;
    }
    // The URL is the deleted page's own (`/p/{slug}`, rewritten when the row
    // was customized), so leaving the reader on it would strand them on a
    // route with nothing behind it. Send them to the row's database path,
    // where the template render lives.
    const row = localDatabaseRowsCollection.get(rowId);
    const rowTarget = row
      ? databaseRowNavTarget(
          database,
          row,
          pages,
          localBlocksCollection.toArray
        )
      : null;

    clearDatabaseRowPage({
      dispatchPage: dispatch,
      pages,
      row: { databaseId, id: rowId, pageId },
    });
    if (rowTarget) {
      navigate({ ...rowTarget, replace: true });
    }
    appToast.success(`Reset to the ${databaseName} template.`, {
      id: TOAST_ID_CLEAR_ROW_PAGES,
    });
  }, [
    database,
    databaseId,
    databaseName,
    dispatch,
    navigate,
    pageId,
    pages,
    rowId,
  ]);

  if (!(source && databaseName && hasTemplate)) {
    return null;
  }

  return { databaseName, reset };
}

export function ResetRowPageMenuItem({
  onSelect,
}: {
  onSelect: () => void;
}): ReactNode {
  return (
    <DropdownMenuItem onClick={onSelect}>
      <IconRestore />
      Reset to template
    </DropdownMenuItem>
  );
}

export function ResetRowPageDialog({
  onOpenChange,
  open,
  target,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  target: ResetRowPageTarget;
}): ReactNode {
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleConfirm = useCallback(() => {
    target.reset();
    onOpenChange(false);
  }, [onOpenChange, target]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        onKeyDownCapture={createConfirmDialogKeyDownHandler({
          onCancel: handleCancel,
          onConfirm: handleConfirm,
        })}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>
            Reset to the {target.databaseName} template?
          </DialogTitle>
          <DialogDescription>
            Discards this page's body and cover and follows the template again,
            so later template changes reach this row. Its properties and icon
            stay. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ConfirmDialogFooter
          confirmLabel="Reset to template"
          confirmVariant="destructive"
          onCancel={handleCancel}
          onConfirm={handleConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
