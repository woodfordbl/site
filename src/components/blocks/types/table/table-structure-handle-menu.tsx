import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCircleX,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useMemo } from "react";

import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import { Kbd } from "@/components/ui/kbd.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById } from "@/lib/blocks/block-tree.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";

type TableStructureHandleAxis = "column" | "row";

interface TableStructureHandleMenuProps {
  axis: TableStructureHandleAxis;
  columnIndex?: number;
  menuOpen: boolean;
  onClose: () => void;
  rows: CanvasRow[];
  tableId: string;
  tableRowId?: string;
}

export function TableStructureHandleMenu({
  axis,
  columnIndex,
  menuOpen,
  onClose,
  rows,
  tableId,
  tableRowId,
}: TableStructureHandleMenuProps) {
  const { dispatch, duplicateRow } = useCanvasEditorContext();

  const clearRowContents = useCallback(() => {
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
  }, [dispatch, rows, tableRowId]);

  const clearColumnContents = useCallback(() => {
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
  }, [columnIndex, dispatch, rows, tableId]);

  const actionItems = useMemo((): ActionMenuEntry[] => {
    if (axis === "row" && tableRowId) {
      return [
        {
          id: "insert-above",
          label: "Insert above",
          keywords: ["row", "insert", "above", "before"],
          icon: <IconArrowUp />,
          onSelect: () => {
            dispatch({
              type: "table.addRow",
              tableRowId,
              edge: "before",
            });
            onClose();
          },
        },
        {
          id: "insert-below",
          label: "Insert below",
          keywords: ["row", "insert", "below", "after"],
          icon: <IconArrowDown />,
          onSelect: () => {
            dispatch({
              type: "table.addRow",
              tableRowId,
              edge: "after",
            });
            onClose();
          },
        },
        {
          id: "duplicate",
          label: "Duplicate",
          keywords: ["copy", "clone", "row"],
          icon: <IconCopy />,
          onSelect: () => {
            duplicateRow(tableRowId);
            onClose();
          },
        },
        {
          id: "clear-contents",
          label: "Clear contents",
          keywords: ["clear", "empty", "row"],
          icon: <IconCircleX />,
          onSelect: () => {
            clearRowContents();
            onClose();
          },
        },
        {
          id: "delete",
          label: "Delete",
          keywords: ["remove", "trash", "row"],
          icon: <IconTrash />,
          destructive: true,
          onSelect: () => {
            dispatch({ type: "table.removeRow", tableRowId });
            onClose();
          },
        },
      ];
    }

    if (axis === "column" && columnIndex !== undefined) {
      return [
        {
          id: "insert-left",
          label: "Insert left",
          keywords: ["column", "insert", "left", "before"],
          icon: <IconArrowLeft />,
          onSelect: () => {
            dispatch({
              type: "table.addColumn",
              tableId,
              columnIndex,
              edge: "before",
            });
            onClose();
          },
        },
        {
          id: "insert-right",
          label: "Insert right",
          keywords: ["column", "insert", "right", "after"],
          icon: <IconArrowRight />,
          onSelect: () => {
            dispatch({
              type: "table.addColumn",
              tableId,
              columnIndex,
              edge: "after",
            });
            onClose();
          },
        },
        {
          id: "duplicate",
          label: "Duplicate",
          keywords: ["copy", "clone", "column"],
          icon: <IconCopy />,
          onSelect: () => {
            dispatch({
              type: "table.duplicateColumn",
              tableId,
              columnIndex,
            });
            onClose();
          },
        },
        {
          id: "clear-contents",
          label: "Clear contents",
          keywords: ["clear", "empty", "column"],
          icon: <IconCircleX />,
          onSelect: () => {
            clearColumnContents();
            onClose();
          },
        },
        {
          id: "delete",
          label: "Delete",
          keywords: ["remove", "trash", "column"],
          icon: <IconTrash />,
          destructive: true,
          onSelect: () => {
            dispatch({
              type: "table.removeColumn",
              tableId,
              columnIndex,
            });
            onClose();
          },
        },
      ];
    }

    return [];
  }, [
    axis,
    clearColumnContents,
    clearRowContents,
    columnIndex,
    dispatch,
    duplicateRow,
    onClose,
    tableId,
    tableRowId,
  ]);

  const searchKey =
    menuOpen && actionItems.length > 0
      ? `${axis}:${tableId}:${tableRowId ?? columnIndex}`
      : null;

  if (axis === "row" && tableRowId) {
    return (
      <DropdownMenuGroup>
        <ActionMenuSearchSection activeKey={searchKey} items={actionItems}>
          <DropdownMenuLabel>Row</DropdownMenuLabel>
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
            <IconArrowUp />
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
            <IconArrowDown />
            Insert below
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
        </ActionMenuSearchSection>
      </DropdownMenuGroup>
    );
  }

  if (axis === "column" && columnIndex !== undefined) {
    return (
      <DropdownMenuGroup>
        <ActionMenuSearchSection activeKey={searchKey} items={actionItems}>
          <DropdownMenuLabel>Column</DropdownMenuLabel>
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
          <DropdownMenuSeparator />
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
        </ActionMenuSearchSection>
      </DropdownMenuGroup>
    );
  }

  return null;
}
