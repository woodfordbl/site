import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import {
  buildBlockTree,
  type CanvasRow,
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
import {
  placementAfterRow,
  resolveRowPlacementPlan,
} from "@/lib/blocks/row-placement.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import type { Block } from "@/lib/schemas/block.ts";

export const DEFAULT_COLUMN_WIDTH = 1;
export const MIN_COLUMN_FLEX_WIDTH = 0.25;
export const MIN_COLUMNS_COUNT = 2;
export const MAX_COLUMNS_COUNT = 4;

/** Map pointer delta (px) to resized flex-grow pair while preserving pair sum. */
export function computeColumnResizeWidths(params: {
  containerWidthPx: number;
  deltaPx: number;
  flexSumAll: number;
  pairTotal: number;
  startLeftWidth: number;
}): { leftWidth: number; rightWidth: number } {
  const { containerWidthPx, deltaPx, flexSumAll, pairTotal, startLeftWidth } =
    params;
  const ratioDelta =
    containerWidthPx > 0 ? (deltaPx / containerWidthPx) * flexSumAll : 0;
  const leftWidth = Math.max(
    MIN_COLUMN_FLEX_WIDTH,
    Math.min(pairTotal - MIN_COLUMN_FLEX_WIDTH, startLeftWidth + ratioDelta)
  );
  return { leftWidth, rightWidth: pairTotal - leftWidth };
}

export function columnFlexStyle(width: number | undefined): {
  flex: string;
  minWidth: number;
} {
  const grow = width ?? DEFAULT_COLUMN_WIDTH;
  return { flex: `${grow} 1 0`, minWidth: 0 };
}

/** Equal flex-grow ratios across column blocks. */
export function equalizeColumnWidths(columnBlocks: Block[]): Block[] {
  const width = DEFAULT_COLUMN_WIDTH;
  return columnBlocks.map((block) => {
    if (block.type !== "column") {
      return block;
    }
    return {
      ...block,
      props: { ...block.props, width },
    };
  });
}

export function buildColumnBlock(
  parentId: string
): Extract<Block, { type: "column" }> {
  const block = createEmptyBlock("column") as Extract<
    Block,
    { type: "column" }
  >;
  return {
    ...block,
    parentId,
    props: { width: DEFAULT_COLUMN_WIDTH },
  };
}

export function buildColumnsBlock(
  id: string,
  options: { indent: number; parentId: string | null }
): Extract<Block, { type: "columns" }> {
  const block = createEmptyBlock("columns") as Extract<
    Block,
    { type: "columns" }
  >;
  return {
    ...block,
    id,
    indent: options.indent,
    parentId: options.parentId,
    props: {},
  };
}

/**
 * What each new column is seeded with: one empty `text` row (default) or one
 * unlinked `database` block (the Dashboard slash scaffold — its placeholder
 * trigger opens the create/link picker on focus).
 */
export type ColumnsSeedChildType = "text" | "database";

/** Effects to replace a canvas row with a multi-column layout. */
export function planColumnsCreate(
  rows: CanvasRow[],
  rowId: string,
  count: 2 | 3 | 4,
  seedTextOverride?: string,
  seedChildType: ColumnsSeedChildType = "text"
): CanvasEffect[] {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return [];
  }

  const sourceBlock = ctx.row.effectiveBlock;
  const columnsBlock = buildColumnsBlock(rowId, {
    indent: getBlockIndent(sourceBlock),
    parentId: sourceBlock.parentId ?? null,
  });

  const effects: CanvasEffect[] = [
    {
      type: "persist",
      rowId,
      block: columnsBlock,
    },
  ];

  let lastColumnId: string | undefined;
  let firstTextRowId: string | null = null;

  for (let index = 0; index < count; index += 1) {
    const columnBlock = buildColumnBlock(rowId);
    const placement = lastColumnId
      ? {
          parentId: rowId,
          anchorRowId: lastColumnId,
          edge: "after" as const,
        }
      : { parentId: rowId, atScopeStart: true as const };

    effects.push({
      type: "insert",
      position: placement,
      block: columnBlock,
      focus: false,
    });
    lastColumnId = columnBlock.id;

    // Database seeds drop the source text (the scaffold is invoked from an
    // empty slash row; a database placeholder has no text slot to keep it).
    const seedBlock: Block =
      seedChildType === "database"
        ? createEmptyBlock("database")
        : createEmptyBlock("text");
    seedBlock.parentId = columnBlock.id;
    if (index === 0) {
      const seedText = seedTextOverride ?? getTextFromBlock(sourceBlock);
      if (seedBlock.type === "text" && seedText.length > 0) {
        seedBlock.props = { text: seedText };
      }
      firstTextRowId = seedBlock.id;
    }

    effects.push({
      type: "insert",
      position: { parentId: columnBlock.id, atScopeStart: true },
      block: seedBlock,
      focus: index === 0,
    });
  }

  if (firstTextRowId) {
    effects.push({
      type: "focus",
      rowId: firstTextRowId,
      placement: "start",
      offset: 0,
    });
  }

  return effects;
}

/** Applies {@link planColumnsCreate} in memory for a single persistence write. */
export function buildBlocksForColumnsCreate(
  blocks: Block[],
  rows: CanvasRow[],
  rowId: string,
  count: 2 | 3 | 4,
  seedTextOverride?: string,
  seedChildType?: ColumnsSeedChildType
): { blocks: Block[]; focusRowId: string | null } {
  const effects = planColumnsCreate(
    rows,
    rowId,
    count,
    seedTextOverride,
    seedChildType
  );
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

  const columnsRow = buildBlockTree(workingBlocks).find(
    (row) => row.rowId === rowId
  );
  const firstColumnTextRowId =
    columnsRow?.children[0]?.children[0]?.rowId ?? focusRowId;

  return { blocks: workingBlocks, focusRowId: firstColumnTextRowId };
}

/** Unwrap a columns container: hoist column children to the columns' canvas parent. */
export function planColumnsUnwrap(
  rows: CanvasRow[],
  columnsRowId: string,
  options?: { excludeColumnRowIds?: string[] }
): CanvasEffect[] {
  const ctx = findRowContext(rows, columnsRowId);
  if (ctx?.row.effectiveBlock.type !== "columns") {
    return [];
  }

  const columnsBlock = ctx.row.effectiveBlock;
  const parentId = columnsBlock.parentId ?? null;
  const excludedColumnRowIds = new Set(options?.excludeColumnRowIds ?? []);
  const columnChildren = ctx.row.children.filter(
    (columnRow) => !excludedColumnRowIds.has(columnRow.rowId)
  );

  if (columnChildren.length === 0) {
    const placement = placementAfterRow(rows, columnsRowId);
    const effects: CanvasEffect[] = [{ type: "delete", rowId: columnsRowId }];
    for (const excludedRowId of excludedColumnRowIds) {
      effects.push({ type: "delete", rowId: excludedRowId });
    }
    if (placement) {
      effects.push({
        type: "insert",
        position: placement,
        block: createEmptyBlock("text"),
        focus: true,
      });
    }
    return effects;
  }

  const flatContent: CanvasRow[] = [];
  for (const columnRow of columnChildren) {
    for (const child of columnRow.children) {
      flatContent.push(child);
    }
  }

  const effects: CanvasEffect[] = [];
  let anchorRowId: string | undefined;
  const placementBase =
    resolveRowPlacementPlan(rows, columnsRowId, "before") ??
    ({ parentId, atScopeStart: true } as const);

  for (const [index, contentRow] of flatContent.entries()) {
    const position =
      index === 0
        ? placementBase
        : {
            parentId,
            anchorRowId: anchorRowId ?? flatContent[0]?.rowId,
            edge: "after" as const,
          };

    effects.push({
      type: "move",
      rowId: contentRow.rowId,
      position,
    });
    anchorRowId = contentRow.rowId;
  }

  for (const columnRow of columnChildren) {
    effects.push({ type: "delete", rowId: columnRow.rowId });
  }
  effects.push({ type: "delete", rowId: columnsRowId });

  const firstMoved = flatContent[0];
  if (firstMoved) {
    effects.push({
      type: "focus",
      rowId: firstMoved.rowId,
      placement: "start",
    });
  }

  for (const excludedRowId of excludedColumnRowIds) {
    effects.push({ type: "delete", rowId: excludedRowId });
  }

  return effects;
}

/** Append a column with one empty text row; equalize widths across siblings. */
export function planColumnsAddColumn(
  rows: CanvasRow[],
  columnsRowId: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, columnsRowId);
  if (ctx?.row.effectiveBlock.type !== "columns") {
    return [];
  }

  if (ctx.row.children.length >= MAX_COLUMNS_COUNT) {
    return [];
  }

  const columnBlock = buildColumnBlock(columnsRowId);
  const lastColumn = ctx.row.children.at(-1);
  const columnPlacement = lastColumn
    ? {
        parentId: columnsRowId,
        anchorRowId: lastColumn.rowId,
        edge: "after" as const,
      }
    : { parentId: columnsRowId, atScopeStart: true as const };

  const textBlock = createEmptyBlock("text");
  textBlock.parentId = columnBlock.id;

  const effects: CanvasEffect[] = [
    {
      type: "insert",
      position: columnPlacement,
      block: columnBlock,
      focus: false,
    },
    {
      type: "insert",
      position: { parentId: columnBlock.id, atScopeStart: true },
      block: textBlock,
      focus: true,
    },
  ];

  for (const columnRow of ctx.row.children) {
    const block = columnRow.effectiveBlock;
    if (block.type === "column") {
      effects.push({
        type: "persist",
        rowId: columnRow.rowId,
        block: {
          ...block,
          props: { ...block.props, width: DEFAULT_COLUMN_WIDTH },
        },
      });
    }
  }

  effects.push({
    type: "persist",
    rowId: columnBlock.id,
    block: {
      ...(columnBlock as Extract<Block, { type: "column" }>),
      props: { width: DEFAULT_COLUMN_WIDTH },
    },
  });

  return effects;
}

/** Remove a column; unwrap when fewer than MIN_COLUMNS_COUNT remain. */
export function planColumnsRemoveColumn(
  rows: CanvasRow[],
  columnRowId: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, columnRowId);
  if (ctx?.row.effectiveBlock.type !== "column") {
    return [];
  }

  const columnsParent = ctx.parent;
  if (columnsParent?.effectiveBlock.type !== "columns") {
    return [];
  }

  const remainingCount = columnsParent.children.length - 1;
  if (remainingCount < MIN_COLUMNS_COUNT) {
    return planColumnsUnwrap(rows, columnsParent.rowId, {
      excludeColumnRowIds: [columnRowId],
    });
  }

  const effects: CanvasEffect[] = [{ type: "delete", rowId: columnRowId }];
  const columnIndex = columnsParent.children.findIndex(
    (columnRow) => columnRow.rowId === columnRowId
  );
  const focusColumn =
    columnsParent.children[columnIndex - 1] ??
    columnsParent.children[columnIndex + 1];
  const focusRow = focusColumn?.children.at(-1) ?? focusColumn?.children.at(0);
  if (focusRow) {
    effects.push({
      type: "focus",
      rowId: focusRow.rowId,
      placement: "end",
    });
  }

  for (const columnRow of columnsParent.children) {
    if (columnRow.rowId === columnRowId) {
      continue;
    }
    const block = columnRow.effectiveBlock;
    if (block.type === "column") {
      effects.push({
        type: "persist",
        rowId: columnRow.rowId,
        block: {
          ...block,
          props: { ...block.props, width: DEFAULT_COLUMN_WIDTH },
        },
      });
    }
  }

  return effects;
}
