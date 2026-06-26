"use client";

import { useEffect, useMemo, useState } from "react";

import { useBlockActionsMenu } from "@/components/canvas/block-actions-menu.tsx";
import { BlockGutterMenuProvider } from "@/components/canvas/block-gutter-menu/block-gutter-menu-context.tsx";
import { useCanvasEditorState } from "@/components/canvas/canvas-editor-context.tsx";
import { MobileBlockActionsDrawerContent } from "@/components/canvas/mobile-block-actions-drawer-content.tsx";
import { useRowGutterHandlers } from "@/components/canvas/use-row-gutter-handlers.ts";
import { Drawer, DrawerContent } from "@/components/ui/drawer.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { type CanvasRow, flattenRows } from "@/lib/blocks/block-tree.ts";

function DrawerRowContent({
  onClose,
  row,
}: {
  onClose: () => void;
  row: CanvasRow;
}) {
  const handlers = useRowGutterHandlers(row);

  return (
    <BlockGutterMenuProvider
      onConvert={handlers.onConvert}
      onDelete={handlers.onDelete}
      onDuplicate={handlers.onDuplicate}
      rowId={row.rowId}
    >
      <MobileBlockActionsDrawerContent onClose={onClose} />
    </BlockGutterMenuProvider>
  );
}

/**
 * Mobile (coarse pointer) bottom drawer for block actions. A long-press on a
 * gutterless block opens it via `openRowId`; it reuses the same editor handlers
 * and action data as the desktop gutter menu. Mounted once at the editor root.
 */
export function MobileBlockActionsDrawer() {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { openRowId, closeBlockActionsMenu } = useBlockActionsMenu();
  const { rows } = useCanvasEditorState();

  const row = useMemo(
    () =>
      openRowId
        ? (flattenRows(rows).find((entry) => entry.rowId === openRowId) ?? null)
        : null,
    [openRowId, rows]
  );

  // Retain the last row so the close animation has content to render after
  // `openRowId` clears.
  const [retainedRow, setRetainedRow] = useState<CanvasRow | null>(null);
  useEffect(() => {
    if (row) {
      setRetainedRow(row);
    }
  }, [row]);

  if (!isCoarsePrimaryPointer) {
    return null;
  }

  const open = row !== null;
  const activeRow = row ?? retainedRow;

  return (
    <Drawer
      onOpenChange={(next) => {
        if (!next) {
          closeBlockActionsMenu();
        }
      }}
      open={open}
    >
      {activeRow ? (
        <DrawerContent>
          <DrawerRowContent
            key={activeRow.rowId}
            onClose={closeBlockActionsMenu}
            row={activeRow}
          />
        </DrawerContent>
      ) : null}
    </Drawer>
  );
}
