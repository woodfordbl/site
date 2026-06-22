import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  buildBlockTree,
  type CanvasRow,
  findRowById,
  findRowContext,
} from "@/lib/blocks/block-tree.ts";
import {
  createEmptyBlock,
  getTextFromBlock,
} from "@/lib/blocks/create-block.ts";
import {
  insertBlockAtPlacement,
  updateBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import type { Block } from "@/lib/schemas/block.ts";

/** Default / minimum column width in pixels. */
export const MIN_TABLE_COLUMN_WIDTH_PX = 120;
export const DEFAULT_TABLE_COLUMN_WIDTH = MIN_TABLE_COLUMN_WIDTH_PX;
export const MIN_TABLE_COLUMNS = 2;
export const MIN_TABLE_ROWS = 1;
export const MAX_TABLE_COLUMNS = 10;
export const DEFAULT_TABLE_COLUMNS = 3;
export const DEFAULT_TABLE_ROWS = 3;

export interface TableGrid {
  columnCount: number;
  columnWidths: number[];
  hasHeaderColumn: boolean;
  hasHeaderRow: boolean;
  rows: Array<{
    rowId: string;
    cells: Array<{ cellId: string; text: string }>;
  }>;
  tableId: string;
}

/** Derive a render-friendly grid from a table canvas row. */
export function deriveTableGrid(tableRow: CanvasRow): TableGrid | null {
  const tableBlock = tableRow.effectiveBlock;
  if (tableBlock.type !== "table") {
    return null;
  }

  const rows = tableRow.children.map((row) => ({
    rowId: row.rowId,
    cells: row.children.map((cell) => ({
      cellId: cell.rowId,
      text:
        cell.effectiveBlock.type === "tableCell"
          ? cell.effectiveBlock.props.text
          : "",
    })),
  }));

  const columnCount = Math.max(
    tableBlock.props.columnWidths.length,
    ...rows.map((row) => row.cells.length),
    MIN_TABLE_COLUMNS
  );

  return {
    tableId: tableRow.rowId,
    hasHeaderRow: tableBlock.props.hasHeaderRow,
    hasHeaderColumn: tableBlock.props.hasHeaderColumn,
    columnWidths: resolveTableColumnWidthsPx(tableBlock.props.columnWidths),
    columnCount,
    rows,
  };
}

/** Coerce stored widths to pixels (legacy flex-grow ratios ≤10 map to px). */
export function resolveTableColumnWidthsPx(widths: number[]): number[] {
  if (widths.length === 0) {
    return buildEqualTableColumnWidths(DEFAULT_TABLE_COLUMNS);
  }

  const max = Math.max(...widths);
  if (max <= 10) {
    return widths.map((width) =>
      Math.max(
        MIN_TABLE_COLUMN_WIDTH_PX,
        Math.round(width * MIN_TABLE_COLUMN_WIDTH_PX)
      )
    );
  }

  return widths.map((width) => Math.max(MIN_TABLE_COLUMN_WIDTH_PX, width));
}

export function tableColumnWidthsTotalPx(widths: number[]): number {
  return resolveTableColumnWidthsPx(widths).reduce(
    (sum, width) => sum + width,
    0
  );
}

export function buildEqualTableColumnWidths(count: number): number[] {
  return Array.from({ length: count }, () => DEFAULT_TABLE_COLUMN_WIDTH);
}

export function buildTableBlock(
  id: string,
  options: {
    indent: number;
    parentId: string | null;
    columnCount: number;
    hasHeaderColumn?: boolean;
    hasHeaderRow?: boolean;
  }
): Extract<Block, { type: "table" }> {
  const block = createEmptyBlock("table") as Extract<Block, { type: "table" }>;
  return {
    ...block,
    id,
    indent: options.indent,
    parentId: options.parentId,
    props: {
      hasHeaderRow: options.hasHeaderRow ?? true,
      hasHeaderColumn: options.hasHeaderColumn ?? false,
      columnWidths: buildEqualTableColumnWidths(options.columnCount),
    },
  };
}

export function buildTableRowBlock(
  parentId: string
): Extract<Block, { type: "tableRow" }> {
  const block = createEmptyBlock("tableRow") as Extract<
    Block,
    { type: "tableRow" }
  >;
  return { ...block, parentId, props: {} };
}

export function buildTableCellBlock(
  parentId: string,
  text = ""
): Extract<Block, { type: "tableCell" }> {
  const block = createEmptyBlock("tableCell") as Extract<
    Block,
    { type: "tableCell" }
  >;
  return { ...block, parentId, props: { text } };
}

function findTableContext(
  rows: CanvasRow[],
  tableOrRowId: string
): {
  tableRow: CanvasRow;
  tableBlock: Extract<Block, { type: "table" }>;
} | null {
  const ctx = findRowContext(rows, tableOrRowId);
  if (!ctx) {
    return null;
  }

  if (ctx.row.effectiveBlock.type === "table") {
    return {
      tableRow: ctx.row,
      tableBlock: ctx.row.effectiveBlock,
    };
  }

  if (ctx.row.effectiveBlock.type === "tableRow") {
    const tableParent = ctx.parent;
    if (!tableParent || tableParent.effectiveBlock.type !== "table") {
      return null;
    }
    return {
      tableRow: tableParent,
      tableBlock: tableParent.effectiveBlock,
    };
  }

  if (ctx.row.effectiveBlock.type === "tableCell") {
    const rowParent = ctx.parent;
    if (!rowParent || rowParent.effectiveBlock.type !== "tableRow") {
      return null;
    }
    const tableRowCtx = findRowContext(rows, rowParent.rowId);
    const tableParent = tableRowCtx?.parent;
    if (!tableParent || tableParent.effectiveBlock.type !== "table") {
      return null;
    }
    return {
      tableRow: tableParent,
      tableBlock: tableParent.effectiveBlock,
    };
  }

  return null;
}

function getTableColumnCount(tableRow: CanvasRow): number {
  const widths =
    tableRow.effectiveBlock.type === "table"
      ? tableRow.effectiveBlock.props.columnWidths.length
      : MIN_TABLE_COLUMNS;
  const rowCounts = tableRow.children.map((row) => row.children.length);
  return Math.max(widths, ...rowCounts, MIN_TABLE_COLUMNS);
}

/** Scale column widths proportionally so their sum matches `targetWidthPx`. */
export function computeTableFitToWidthColumnWidths(
  columnWidths: number[],
  targetWidthPx: number
): number[] {
  const resolved = resolveTableColumnWidthsPx(columnWidths);
  const count = resolved.length;
  if (count === 0 || targetWidthPx <= 0) {
    return resolved;
  }

  const minTotal = MIN_TABLE_COLUMN_WIDTH_PX * count;
  if (targetWidthPx <= minTotal) {
    return buildEqualTableColumnWidths(count);
  }

  const total = resolved.reduce((sum, width) => sum + width, 0);
  if (total <= 0) {
    const equal = Math.floor(targetWidthPx / count);
    const remainder = targetWidthPx - equal * count;
    return resolved.map((_, index) =>
      Math.max(
        MIN_TABLE_COLUMN_WIDTH_PX,
        equal + (index === count - 1 ? remainder : 0)
      )
    );
  }

  const scale = targetWidthPx / total;
  const scaled = resolved.map((width) =>
    Math.max(MIN_TABLE_COLUMN_WIDTH_PX, Math.round(width * scale))
  );

  let drift = targetWidthPx - scaled.reduce((sum, width) => sum + width, 0);
  for (let index = scaled.length - 1; drift !== 0 && index >= 0; index -= 1) {
    const current = scaled[index] ?? MIN_TABLE_COLUMN_WIDTH_PX;
    const adjustment = drift > 0 ? 1 : -1;
    const next = current + adjustment;
    if (next < MIN_TABLE_COLUMN_WIDTH_PX) {
      continue;
    }
    scaled[index] = next;
    drift -= adjustment;
  }

  return scaled;
}

/** Resize one column by pointer delta; other columns keep their pixel width. */
export function computeTableColumnResizeWidths(params: {
  columnIndex: number;
  columnWidths: number[];
  deltaPx: number;
}): number[] {
  const { columnIndex, columnWidths, deltaPx } = params;
  if (columnIndex < 0 || columnIndex >= columnWidths.length) {
    return columnWidths;
  }

  const resolved = resolveTableColumnWidthsPx(columnWidths);
  const next = [...resolved];
  const start = next[columnIndex] ?? DEFAULT_TABLE_COLUMN_WIDTH;
  next[columnIndex] = Math.max(MIN_TABLE_COLUMN_WIDTH_PX, start + deltaPx);
  return next;
}

export interface PlanTableCreateOptions {
  columns?: number;
  hasHeaderRow?: boolean;
  rows?: number;
  seedText?: string;
}

/** Replace a canvas row with a table grid. */
export function planTableCreate(
  rows: CanvasRow[],
  rowId: string,
  options: PlanTableCreateOptions = {}
): CanvasEffect[] {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return [];
  }

  const columnCount = Math.min(
    MAX_TABLE_COLUMNS,
    Math.max(MIN_TABLE_COLUMNS, options.columns ?? DEFAULT_TABLE_COLUMNS)
  );
  const rowCount = Math.max(MIN_TABLE_ROWS, options.rows ?? DEFAULT_TABLE_ROWS);
  const hasHeaderRow = options.hasHeaderRow ?? true;
  const sourceBlock = ctx.row.effectiveBlock;

  const tableBlock = buildTableBlock(rowId, {
    indent: getBlockIndent(sourceBlock),
    parentId: sourceBlock.parentId ?? null,
    columnCount,
    hasHeaderRow,
  });

  const effects: CanvasEffect[] = [
    { type: "persist", rowId, block: tableBlock },
  ];

  const seedText = options.seedText ?? getTextFromBlock(sourceBlock);
  const firstCellId = appendTableGridInsertEffects(
    effects,
    rowId,
    rowCount,
    columnCount,
    seedText
  );

  if (firstCellId) {
    effects.push({
      type: "focus",
      rowId: firstCellId,
      placement: "start",
      offset: seedText.length,
    });
  }

  return effects;
}

/** Applies {@link planTableCreate} in memory for a single persistence write. */
export function buildBlocksForTableCreate(
  blocks: Block[],
  rows: CanvasRow[],
  rowId: string,
  options: PlanTableCreateOptions = {}
): { blocks: Block[]; focusRowId: string | null } {
  const effects = planTableCreate(rows, rowId, options);
  let workingBlocks = blocks;
  let workingRows = rows;
  let focusRowId: string | null = null;

  for (const effect of effects) {
    if (effect.type === "persist") {
      workingBlocks = updateBlockByRowId(
        workingBlocks,
        effect.rowId,
        effect.block
      );
      workingRows = buildBlockTree(workingBlocks);
      continue;
    }

    if (effect.type === "insert") {
      workingBlocks = insertBlockAtPlacement(
        workingBlocks,
        workingRows,
        effect.position,
        effect.block
      );
      workingRows = buildBlockTree(workingBlocks);
      if (effect.focus) {
        focusRowId = effect.block.id;
      }
      continue;
    }

    if (effect.type === "focus") {
      focusRowId = effect.rowId;
    }
  }

  return { blocks: workingBlocks, focusRowId };
}

/** Map pointer delta to whole scrub steps; half a step counts (Notion-style). */
export function computeTableScrubDelta(
  deltaPx: number,
  stepPx: number
): number {
  if (stepPx <= 0) {
    return 0;
  }

  const halfStep = stepPx / 2;
  const steps =
    deltaPx >= 0
      ? Math.floor((deltaPx + halfStep) / stepPx)
      : Math.ceil((deltaPx - halfStep) / stepPx);

  return steps === 0 ? 0 : steps;
}

export function clampTableRowCount(count: number): number {
  return Math.max(MIN_TABLE_ROWS, count);
}

export function clampTableColumnCount(count: number): number {
  return Math.min(MAX_TABLE_COLUMNS, Math.max(MIN_TABLE_COLUMNS, count));
}

export function planTableAddRow(
  rows: CanvasRow[],
  anchorRowId: string,
  edge: "before" | "after" = "after",
  options: { focus?: boolean } = {}
): CanvasEffect[] {
  const ctx = findRowContext(rows, anchorRowId);
  if (!ctx || ctx.row.effectiveBlock.type !== "tableRow") {
    return [];
  }

  const tableCtx = findTableContext(rows, anchorRowId);
  if (!tableCtx) {
    return [];
  }

  const shouldFocus = options.focus ?? true;
  const columnCount = getTableColumnCount(tableCtx.tableRow);
  const rowBlock = buildTableRowBlock(tableCtx.tableRow.rowId);
  const effects: CanvasEffect[] = [
    {
      type: "insert",
      position: {
        parentId: tableCtx.tableRow.rowId,
        anchorRowId,
        edge,
      },
      block: rowBlock,
      focus: false,
    },
  ];

  let lastCellId: string | undefined;
  let firstCellId: string | null = null;
  for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
    const cellBlock = buildTableCellBlock(rowBlock.id);
    const cellPlacement = lastCellId
      ? {
          parentId: rowBlock.id,
          anchorRowId: lastCellId,
          edge: "after" as const,
        }
      : { parentId: rowBlock.id, atScopeStart: true as const };

    effects.push({
      type: "insert",
      position: cellPlacement,
      block: cellBlock,
      focus: shouldFocus && colIndex === 0,
    });
    lastCellId = cellBlock.id;
    if (colIndex === 0) {
      firstCellId = cellBlock.id;
    }
  }

  if (firstCellId && shouldFocus) {
    effects.push({
      type: "focus",
      rowId: firstCellId,
      placement: "start",
    });
  }

  return effects;
}

export function planTableAddColumn(
  rows: CanvasRow[],
  tableId: string,
  columnIndex: number,
  edge: "before" | "after",
  options: { focus?: boolean } = {}
): CanvasEffect[] {
  const tableCtx = findTableContext(rows, tableId);
  if (!tableCtx) {
    return [];
  }

  const shouldFocus = options.focus ?? true;
  const { tableRow, tableBlock } = tableCtx;
  const currentCount = getTableColumnCount(tableRow);
  if (currentCount >= MAX_TABLE_COLUMNS) {
    return [];
  }

  const insertIndex =
    edge === "before" ? columnIndex : Math.min(columnIndex + 1, currentCount);
  const effects: CanvasEffect[] = [];
  let focusCellId: string | null = null;

  for (const [rowIndex, row] of tableRow.children.entries()) {
    const position = resolveTableCellInsertPosition(row, insertIndex);
    const cellBlock = buildTableCellBlock(row.rowId);
    effects.push({
      type: "insert",
      position,
      block: cellBlock,
      focus: false,
    });
    if (rowIndex === 0) {
      focusCellId = cellBlock.id;
    }
  }

  const nextWidths = [...tableBlock.props.columnWidths];
  nextWidths.splice(insertIndex, 0, DEFAULT_TABLE_COLUMN_WIDTH);
  effects.push({
    type: "persist",
    rowId: tableId,
    block: {
      ...tableBlock,
      props: { ...tableBlock.props, columnWidths: nextWidths },
    },
  });

  if (focusCellId && shouldFocus) {
    effects.push({
      type: "focus",
      rowId: focusCellId,
      placement: "start",
    });
  }

  return effects;
}

export function planTableDuplicateColumn(
  rows: CanvasRow[],
  tableId: string,
  columnIndex: number
): CanvasEffect[] {
  const tableCtx = findTableContext(rows, tableId);
  if (!tableCtx) {
    return [];
  }

  const { tableRow, tableBlock } = tableCtx;
  const currentCount = getTableColumnCount(tableRow);
  if (currentCount >= MAX_TABLE_COLUMNS) {
    return [];
  }

  const insertIndex = columnIndex + 1;
  const effects: CanvasEffect[] = [];
  const widths = resolveTableColumnWidthsPx(tableBlock.props.columnWidths);
  const sourceWidth = widths[columnIndex] ?? DEFAULT_TABLE_COLUMN_WIDTH;
  let focusCellId: string | null = null;

  for (const [rowIndex, row] of tableRow.children.entries()) {
    const sourceCell = row.children[columnIndex];
    const sourceText =
      sourceCell?.effectiveBlock.type === "tableCell"
        ? sourceCell.effectiveBlock.props.text
        : "";
    const position = resolveTableCellInsertPosition(row, insertIndex);
    const cellBlock = buildTableCellBlock(row.rowId, sourceText);
    effects.push({
      type: "insert",
      position,
      block: cellBlock,
      focus: false,
    });
    if (rowIndex === 0) {
      focusCellId = cellBlock.id;
    }
  }

  const nextWidths = resolveTableColumnWidthsPx(tableBlock.props.columnWidths);
  nextWidths.splice(insertIndex, 0, sourceWidth);
  effects.push({
    type: "persist",
    rowId: tableId,
    block: {
      ...tableBlock,
      props: { ...tableBlock.props, columnWidths: nextWidths },
    },
  });

  if (focusCellId) {
    effects.push({
      type: "focus",
      rowId: focusCellId,
      placement: "start",
    });
  }

  return effects;
}

export function planTableRemoveRow(
  rows: CanvasRow[],
  tableRowId: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, tableRowId);
  if (!ctx || ctx.row.effectiveBlock.type !== "tableRow") {
    return [];
  }

  const tableCtx = findTableContext(rows, tableRowId);
  if (!tableCtx) {
    return [];
  }

  if (tableCtx.tableRow.children.length <= MIN_TABLE_ROWS) {
    return [];
  }

  const effects: CanvasEffect[] = [{ type: "delete", rowId: tableRowId }];

  const isHeaderRow =
    tableCtx.tableBlock.props.hasHeaderRow &&
    tableCtx.tableRow.children[0]?.rowId === tableRowId;

  if (isHeaderRow) {
    effects.push({
      type: "persist",
      rowId: tableCtx.tableRow.rowId,
      block: {
        ...tableCtx.tableBlock,
        props: { ...tableCtx.tableBlock.props, hasHeaderRow: false },
      },
    });
  }

  const sibling = ctx.siblings[ctx.index - 1] ?? ctx.siblings[ctx.index + 1];
  const focusCell = sibling?.children[0];
  if (focusCell) {
    effects.push({
      type: "focus",
      rowId: focusCell.rowId,
      placement: "start",
    });
  }

  return effects;
}

export function planTableRemoveColumn(
  rows: CanvasRow[],
  tableId: string,
  columnIndex: number
): CanvasEffect[] {
  const tableCtx = findTableContext(rows, tableId);
  if (!tableCtx) {
    return [];
  }

  const columnCount = getTableColumnCount(tableCtx.tableRow);
  if (columnCount <= MIN_TABLE_COLUMNS) {
    return [];
  }

  const effects: CanvasEffect[] = [];
  for (const row of tableCtx.tableRow.children) {
    const cell = row.children[columnIndex];
    if (cell) {
      effects.push({ type: "delete", rowId: cell.rowId });
    }
  }

  const nextWidths = [...tableCtx.tableBlock.props.columnWidths];
  nextWidths.splice(columnIndex, 1);
  effects.push({
    type: "persist",
    rowId: tableId,
    block: {
      ...tableCtx.tableBlock,
      props: { ...tableCtx.tableBlock.props, columnWidths: nextWidths },
    },
  });

  const focusCell =
    tableCtx.tableRow.children[0]?.children[
      Math.min(columnIndex, columnCount - 2)
    ];
  if (focusCell) {
    effects.push({
      type: "focus",
      rowId: focusCell.rowId,
      placement: "start",
    });
  }

  return effects;
}

function reorderArray<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return items;
  }
  const next = [...items];
  const [removed] = next.splice(fromIndex, 1);
  if (removed === undefined) {
    return items;
  }
  next.splice(toIndex, 0, removed);
  return next;
}

/** Batch-move the cell at `fromIndex` to `toIndex` in every row; permute columnWidths. */
export function planTableReorderColumn(
  rows: CanvasRow[],
  tableId: string,
  fromIndex: number,
  toIndex: number
): CanvasEffect[] {
  if (fromIndex === toIndex) {
    return [];
  }

  const tableCtx = findTableContext(rows, tableId);
  if (!tableCtx) {
    return [];
  }

  const columnCount = getTableColumnCount(tableCtx.tableRow);
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= columnCount ||
    toIndex >= columnCount
  ) {
    return [];
  }

  const effects: CanvasEffect[] = [];

  for (const row of tableCtx.tableRow.children) {
    const cells = row.children;
    const fromCell = cells[fromIndex];
    const toCell = cells[toIndex];
    if (!(fromCell && toCell)) {
      continue;
    }

    if (fromIndex < toIndex) {
      effects.push({
        type: "move",
        rowId: fromCell.rowId,
        position: {
          parentId: row.rowId,
          anchorRowId: toCell.rowId,
          edge: "after",
        },
      });
    } else {
      effects.push({
        type: "move",
        rowId: fromCell.rowId,
        position: {
          parentId: row.rowId,
          anchorRowId: toCell.rowId,
          edge: "before",
        },
      });
    }
  }

  const nextWidths = reorderArray(
    tableCtx.tableBlock.props.columnWidths,
    fromIndex,
    toIndex
  );
  effects.push({
    type: "persist",
    rowId: tableId,
    block: {
      ...tableCtx.tableBlock,
      props: { ...tableCtx.tableBlock.props, columnWidths: nextWidths },
    },
  });

  return effects;
}

export function planTableToggleHeaderRow(
  rows: CanvasRow[],
  tableId: string,
  enabled: boolean
): CanvasEffect[] {
  const tableRow = findRowById(rows, tableId);
  if (!tableRow || tableRow.effectiveBlock.type !== "table") {
    return [];
  }

  const block = tableRow.effectiveBlock;
  if (block.props.hasHeaderRow === enabled) {
    return [];
  }

  return [
    {
      type: "persist",
      rowId: tableId,
      block: {
        ...block,
        props: { ...block.props, hasHeaderRow: enabled },
      },
    },
  ];
}

export function planTableToggleHeaderColumn(
  rows: CanvasRow[],
  tableId: string,
  enabled: boolean
): CanvasEffect[] {
  const tableRow = findRowById(rows, tableId);
  if (!tableRow || tableRow.effectiveBlock.type !== "table") {
    return [];
  }

  const block = tableRow.effectiveBlock;
  if (block.props.hasHeaderColumn === enabled) {
    return [];
  }

  return [
    {
      type: "persist",
      rowId: tableId,
      block: {
        ...block,
        props: { ...block.props, hasHeaderColumn: enabled },
      },
    },
  ];
}

export function planTableFitToWidth(
  rows: CanvasRow[],
  tableId: string,
  targetWidthPx: number
): CanvasEffect[] {
  const tableRow = findRowById(rows, tableId);
  if (!tableRow || tableRow.effectiveBlock.type !== "table") {
    return [];
  }

  const block = tableRow.effectiveBlock;
  const columnWidths = computeTableFitToWidthColumnWidths(
    block.props.columnWidths,
    targetWidthPx
  );

  return planTableUpdateColumnWidths(rows, tableId, columnWidths);
}

export function planTableUpdateColumnWidths(
  rows: CanvasRow[],
  tableId: string,
  columnWidths: number[]
): CanvasEffect[] {
  const tableRow = findRowById(rows, tableId);
  if (!tableRow || tableRow.effectiveBlock.type !== "table") {
    return [];
  }

  const block = tableRow.effectiveBlock;
  return [
    {
      type: "persist",
      rowId: tableId,
      block: {
        ...block,
        props: { ...block.props, columnWidths },
      },
    },
  ];
}

export function findTableCellAt(
  rows: CanvasRow[],
  tableId: string,
  rowIndex: number,
  columnIndex: number
): CanvasRow | null {
  const tableRow = findRowById(rows, tableId);
  if (!tableRow) {
    return null;
  }
  const row = tableRow.children[rowIndex];
  return row?.children[columnIndex] ?? null;
}

export function planTableFocusAdjacentCell(
  rows: CanvasRow[],
  cellRowId: string,
  direction: "next" | "previous" | "down" | "up"
): CanvasEffect[] {
  const ctx = findRowContext(rows, cellRowId);
  if (!ctx || ctx.row.effectiveBlock.type !== "tableCell") {
    return [];
  }

  const tableCtx = findTableContext(rows, cellRowId);
  if (!tableCtx) {
    return [];
  }

  const rowIndex = tableCtx.tableRow.children.findIndex(
    (row) => row.rowId === ctx.parent?.rowId
  );
  const columnIndex = ctx.index;
  const rowCount = tableCtx.tableRow.children.length;
  const columnCount = getTableColumnCount(tableCtx.tableRow);

  const targetIndices = resolveTableFocusTargetIndices(
    direction,
    rowIndex,
    columnIndex,
    rowCount,
    columnCount
  );

  if (targetIndices === null) {
    return [];
  }

  if (targetIndices === "add-row") {
    return planTableAddRow(rows, ctx.parent?.rowId ?? cellRowId, "after");
  }

  const target = findTableCellAt(
    rows,
    tableCtx.tableRow.rowId,
    targetIndices.rowIndex,
    targetIndices.columnIndex
  );
  if (!target) {
    return [];
  }

  return [
    {
      type: "focus",
      rowId: target.rowId,
      placement: "start",
    },
  ];
}

function appendTableGridInsertEffects(
  effects: CanvasEffect[],
  tableId: string,
  rowCount: number,
  columnCount: number,
  seedText: string
): string | null {
  let lastRowId: string | undefined;
  let firstCellId: string | null = null;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowBlock = buildTableRowBlock(tableId);
    const rowPlacement = lastRowId
      ? { parentId: tableId, anchorRowId: lastRowId, edge: "after" as const }
      : { parentId: tableId, atScopeStart: true as const };

    effects.push({
      type: "insert",
      position: rowPlacement,
      block: rowBlock,
      focus: false,
    });
    lastRowId = rowBlock.id;

    let lastCellId: string | undefined;
    for (let colIndex = 0; colIndex < columnCount; colIndex += 1) {
      const isFirstCell = rowIndex === 0 && colIndex === 0;
      const cellText = isFirstCell && seedText.length > 0 ? seedText : "";
      const cellBlock = buildTableCellBlock(rowBlock.id, cellText);
      const cellPlacement = lastCellId
        ? {
            parentId: rowBlock.id,
            anchorRowId: lastCellId,
            edge: "after" as const,
          }
        : { parentId: rowBlock.id, atScopeStart: true as const };

      effects.push({
        type: "insert",
        position: cellPlacement,
        block: cellBlock,
        focus: isFirstCell,
      });
      lastCellId = cellBlock.id;
      if (isFirstCell) {
        firstCellId = cellBlock.id;
      }
    }
  }

  return firstCellId;
}

function resolveTableCellInsertPosition(
  row: CanvasRow,
  insertIndex: number
):
  | { parentId: string; atScopeStart: true }
  | {
      parentId: string;
      anchorRowId: string;
      edge: "after";
    } {
  if (insertIndex === 0) {
    return { parentId: row.rowId, atScopeStart: true as const };
  }

  const anchorCell = row.children[insertIndex - 1];
  if (anchorCell) {
    return {
      parentId: row.rowId,
      anchorRowId: anchorCell.rowId,
      edge: "after" as const,
    };
  }

  return { parentId: row.rowId, atScopeStart: true as const };
}

function resolveTableFocusTargetIndices(
  direction: "next" | "previous" | "down" | "up",
  rowIndex: number,
  columnIndex: number,
  rowCount: number,
  columnCount: number
): { rowIndex: number; columnIndex: number } | "add-row" | null {
  if (direction === "next") {
    if (columnIndex + 1 < columnCount) {
      return { rowIndex, columnIndex: columnIndex + 1 };
    }
    if (rowIndex + 1 < rowCount) {
      return { rowIndex: rowIndex + 1, columnIndex: 0 };
    }
    return null;
  }

  if (direction === "previous") {
    if (columnIndex > 0) {
      return { rowIndex, columnIndex: columnIndex - 1 };
    }
    if (rowIndex > 0) {
      return { rowIndex: rowIndex - 1, columnIndex: columnCount - 1 };
    }
    return null;
  }

  if (direction === "down") {
    if (rowIndex + 1 < rowCount) {
      return { rowIndex: rowIndex + 1, columnIndex };
    }
    return "add-row";
  }

  if (rowIndex > 0) {
    return { rowIndex: rowIndex - 1, columnIndex };
  }

  return null;
}
