import {
  IconArrowLeft,
  IconArrowRight,
  IconCircleX,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";

type TableStructureHandleAxis = "column" | "row";

interface TableStructureHandleMenuProps {
  axis: TableStructureHandleAxis;
  columnIndex?: number;
  onClose: () => void;
  rows: CanvasRow[];
  tableId: string;
  tableRowId?: string;
}

export function TableStructureHandleMenu({
  axis,
  columnIndex,
  onClose,
  rows,
  tableId,
  tableRowId,
}: TableStructureHandleMenuProps) {
  const { dispatch, duplicateRow } = useCanvasEditorContext();

  const clearRowContents = () => {
    if (!tableRowId) {
      return;
    }
    const row = findRowById(rows, tableRowId);
    if (!row) {
      return;
    }
    for (const cell of row.children) {
      const block = cell.effectiveBlock;
      if (block.type !== "tableCell" || block.props.text.length === 0) {
        continue;
      }
      dispatch({
        type: "row.update",
        rowId: cell.rowId,
        block: { ...block, props: { text: "" } },
      });
    }
  };

  const clearColumnContents = () => {
    if (columnIndex === undefined) {
      return;
    }
    const tableRow = findRowById(rows, tableId);
    if (!tableRow) {
      return;
    }
    for (const row of tableRow.children) {
      const cell = row.children[columnIndex];
      const block = cell?.effectiveBlock;
      if (
        !cell ||
        block?.type !== "tableCell" ||
        block.props.text.length === 0
      ) {
        continue;
      }
      dispatch({
        type: "row.update",
        rowId: cell.rowId,
        block: { ...block, props: { text: "" } },
      });
    }
  };

  if (axis === "row" && tableRowId) {
    return (
      <>
        <DropdownMenuItem
          onClick={() => {
            dispatch({
              type: "table.addRow",
              tableRowId,
              edge: "before",
            });
            onClose();
          }}
        >
          <IconArrowLeft />
          Insert above
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            dispatch({
              type: "table.addRow",
              tableRowId,
              edge: "after",
            });
            onClose();
          }}
        >
          <IconArrowRight />
          Insert below
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            duplicateRow(tableRowId);
            onClose();
          }}
        >
          <IconCopy />
          Duplicate
          <Kbd className="ml-auto">⌘D</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            clearRowContents();
            onClose();
          }}
        >
          <IconCircleX />
          Clear contents
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            dispatch({ type: "table.removeRow", tableRowId });
            onClose();
          }}
          variant="destructive"
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      </>
    );
  }

  if (axis === "column" && columnIndex !== undefined) {
    return (
      <>
        <DropdownMenuItem
          onClick={() => {
            dispatch({
              type: "table.addColumn",
              tableId,
              columnIndex,
              edge: "before",
            });
            onClose();
          }}
        >
          <IconArrowLeft />
          Insert left
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            dispatch({
              type: "table.addColumn",
              tableId,
              columnIndex,
              edge: "after",
            });
            onClose();
          }}
        >
          <IconArrowRight />
          Insert right
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            dispatch({
              type: "table.duplicateColumn",
              tableId,
              columnIndex,
            });
            onClose();
          }}
        >
          <IconCopy />
          Duplicate
          <Kbd className="ml-auto">⌘D</Kbd>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            clearColumnContents();
            onClose();
          }}
        >
          <IconCircleX />
          Clear contents
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            dispatch({
              type: "table.removeColumn",
              tableId,
              columnIndex,
            });
            onClose();
          }}
          variant="destructive"
        >
          <IconTrash />
          Delete
        </DropdownMenuItem>
      </>
    );
  }

  return null;
}
