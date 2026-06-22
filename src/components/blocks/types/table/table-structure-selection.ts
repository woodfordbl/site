import { MAX_TABLE_COLUMNS } from "@/lib/canvas/table-layout.ts";

export type TableStructureSelection =
  | { columnIndex: number; tableId: string; type: "column" }
  | { tableId: string; tableRowId: string; type: "row" };

/**
 * Literal Tailwind variants for column-handle reveal — must stay static so JIT
 * emits CSS for every index up to {@link MAX_TABLE_COLUMNS}.
 */
const TABLE_COLUMN_HANDLE_REVEAL_CLASSES = [
  '[&:has([data-table-column-index="0"]:hover)_[data-table-column-handle="0"]]:opacity-100',
  '[&:has([data-table-column-index="1"]:hover)_[data-table-column-handle="1"]]:opacity-100',
  '[&:has([data-table-column-index="2"]:hover)_[data-table-column-handle="2"]]:opacity-100',
  '[&:has([data-table-column-index="3"]:hover)_[data-table-column-handle="3"]]:opacity-100',
  '[&:has([data-table-column-index="4"]:hover)_[data-table-column-handle="4"]]:opacity-100',
  '[&:has([data-table-column-index="5"]:hover)_[data-table-column-handle="5"]]:opacity-100',
  '[&:has([data-table-column-index="6"]:hover)_[data-table-column-handle="6"]]:opacity-100',
  '[&:has([data-table-column-index="7"]:hover)_[data-table-column-handle="7"]]:opacity-100',
  '[&:has([data-table-column-index="8"]:hover)_[data-table-column-handle="8"]]:opacity-100',
  '[&:has([data-table-column-index="9"]:hover)_[data-table-column-handle="9"]]:opacity-100',
] as const;

/** Reveal column handles when any cell in that column is hovered. */
export function getTableColumnHandleRevealClasses(columnCount: number): string {
  return TABLE_COLUMN_HANDLE_REVEAL_CLASSES.slice(
    0,
    Math.min(columnCount, MAX_TABLE_COLUMNS)
  ).join(" ");
}

/** Per-cell selection border segments for a selected table row or column. */
export function getTableCellStructureSelectionClassName({
  columnCount,
  columnIndex,
  rowCount,
  rowIndex,
  selection,
  tableId,
  tableRowId,
}: {
  columnCount: number;
  columnIndex: number;
  rowCount: number;
  rowIndex: number;
  selection: TableStructureSelection | null;
  tableId: string;
  tableRowId: string;
}): string | undefined {
  if (!selection || selection.tableId !== tableId) {
    return;
  }

  const isFirstRow = rowIndex === 0;
  const isLastRow = rowIndex === rowCount - 1;
  const isFirstColumn = columnIndex === 0;
  const isLastColumn = columnIndex === columnCount - 1;
  const classes: string[] = [];

  if (selection.type === "row" && selection.tableRowId === tableRowId) {
    classes.push(
      "border-t-2",
      "border-t-primary",
      "border-b-2",
      "border-b-primary"
    );
    if (isFirstColumn) {
      classes.push("border-l-2", "border-l-primary");
    }
    if (isLastColumn) {
      classes.push("border-r-2", "border-r-primary");
    }
  } else if (
    selection.type === "column" &&
    selection.columnIndex === columnIndex
  ) {
    classes.push(
      "border-l-2",
      "border-l-primary",
      "border-r-2",
      "border-r-primary"
    );
    if (isFirstRow) {
      classes.push("border-t-2", "border-t-primary");
    }
    if (isLastRow) {
      classes.push("border-b-2", "border-b-primary");
    }
  }

  if (classes.length === 0) {
    return;
  }

  return classes.join(" ");
}

export function isTableStructureSelected({
  columnIndex,
  selection,
  tableId,
  tableRowId,
}: {
  columnIndex?: number;
  selection: TableStructureSelection | null;
  tableId: string;
  tableRowId?: string;
}): boolean {
  if (!selection || selection.tableId !== tableId) {
    return false;
  }
  if (selection.type === "row") {
    return selection.tableRowId === tableRowId;
  }
  return selection.columnIndex === columnIndex;
}
