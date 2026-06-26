"use client";

import { useEffect, useMemo, useState } from "react";

import {
  BlockActionsMenu,
  BlockActionsMenuContent,
  useBlockActionsMenu,
} from "@/components/canvas/block-actions-menu.tsx";
import { BlockGutterMenu } from "@/components/canvas/block-gutter-menu/block-gutter-menu.tsx";
import { useCanvasEditorState } from "@/components/canvas/canvas-editor-context.tsx";
import { useRowGutterHandlers } from "@/components/canvas/use-row-gutter-handlers.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { type CanvasRow, flattenRows } from "@/lib/blocks/block-tree.ts";

function DrawerRowMenu({ row }: { row: CanvasRow }) {
  const handlers = useRowGutterHandlers(row);

  return (
    <BlockGutterMenu
      onConvert={handlers.onConvert}
      onDelete={handlers.onDelete}
      onDuplicate={handlers.onDuplicate}
      rowId={row.rowId}
    />
  );
}

/**
 * Mobile (coarse pointer) block actions. A long-press on a gutterless block
 * sets `openRowId`, which opens the shared `BlockActionsMenu` — rendered as a
 * bottom drawer on touch by the adaptive dropdown primitives. It reuses the
 * exact same gutter menu (and its "Turn into" submenu, now a pushed drawer
 * screen) as the desktop gutter, so there is no separate mobile markup.
 * Mounted once at the editor root.
 */
export function MobileBlockActionsDrawer() {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { openRowId } = useBlockActionsMenu();
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

  const activeRow = row ?? retainedRow;
  if (!activeRow) {
    return null;
  }

  return (
    <BlockActionsMenu rowId={activeRow.rowId}>
      <BlockActionsMenuContent>
        <DrawerRowMenu key={activeRow.rowId} row={activeRow} />
      </BlockActionsMenuContent>
    </BlockActionsMenu>
  );
}
