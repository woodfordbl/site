export type TableStructureSelection =
  | { columnIndex: number; tableId: string; type: "column" }
  | { tableId: string; tableRowId: string; type: "row" };

/** Reveal column handles when any cell in that column is hovered. */
export function getTableColumnHandleRevealClasses(columnCount: number): string {
  return Array.from(
    { length: columnCount },
    (_, columnIndex) =>
      `[&:has([data-table-column-index="${columnIndex}"]:hover)_[data-table-column-handle="${columnIndex}"]]:opacity-100`
  ).join(" ");
}

/** Per-cell accent border segments for a selected table row or column. */
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
    classes.push("border-t-accent", "border-b-accent");
    if (isFirstColumn) {
      classes.push("border-l-accent");
    }
    if (isLastColumn) {
      classes.push("border-r-accent");
    }
  } else if (
    selection.type === "column" &&
    selection.columnIndex === columnIndex
  ) {
    classes.push("border-l-accent", "border-r-accent");
    if (isFirstRow) {
      classes.push("border-t-accent");
    }
    if (isLastRow) {
      classes.push("border-b-accent");
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
