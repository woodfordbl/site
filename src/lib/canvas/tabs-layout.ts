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

/** Removing the last tab dissolves the block, so a single tab is allowed. */
export const MIN_TABS_COUNT = 1;
/** Tabs stack horizontally but scroll, so the cap is generous. */
export const MAX_TABS_COUNT = 8;

/** Human label seeded onto a freshly created tab (`Tab 1`, `Tab 2`, …). */
export function defaultTabLabel(index: number): string {
  return `Tab ${index + 1}`;
}

export function buildTabBlock(
  parentId: string,
  label: string
): Extract<Block, { type: "tab" }> {
  const block = createEmptyBlock("tab") as Extract<Block, { type: "tab" }>;
  return {
    ...block,
    parentId,
    props: { label },
  };
}

export function buildTabsBlock(
  id: string,
  options: { indent: number; parentId: string | null }
): Extract<Block, { type: "tabs" }> {
  const block = createEmptyBlock("tabs") as Extract<Block, { type: "tabs" }>;
  return {
    ...block,
    id,
    indent: options.indent,
    parentId: options.parentId,
    props: {},
  };
}

/** Effects to replace a canvas row with a tabbed layout. */
export function planTabsCreate(
  rows: CanvasRow[],
  rowId: string,
  count: number,
  seedTextOverride?: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, rowId);
  if (!ctx) {
    return [];
  }

  const tabCount = Math.max(MIN_TABS_COUNT, Math.min(MAX_TABS_COUNT, count));
  const sourceBlock = ctx.row.effectiveBlock;
  const tabsBlock = buildTabsBlock(rowId, {
    indent: getBlockIndent(sourceBlock),
    parentId: sourceBlock.parentId ?? null,
  });

  const effects: CanvasEffect[] = [
    {
      type: "persist",
      rowId,
      block: tabsBlock,
    },
  ];

  let lastTabId: string | undefined;
  let firstTextRowId: string | null = null;

  for (let index = 0; index < tabCount; index += 1) {
    const tabBlock = buildTabBlock(rowId, defaultTabLabel(index));
    const placement = lastTabId
      ? {
          parentId: rowId,
          anchorRowId: lastTabId,
          edge: "after" as const,
        }
      : { parentId: rowId, atScopeStart: true as const };

    effects.push({
      type: "insert",
      position: placement,
      block: tabBlock,
      focus: false,
    });
    lastTabId = tabBlock.id;

    const textBlock = createEmptyBlock("text");
    textBlock.parentId = tabBlock.id;
    if (index === 0) {
      const seedText = seedTextOverride ?? getTextFromBlock(sourceBlock);
      if (seedText.length > 0) {
        textBlock.props = { text: seedText };
      }
      firstTextRowId = textBlock.id;
    }

    effects.push({
      type: "insert",
      position: { parentId: tabBlock.id, atScopeStart: true },
      block: textBlock,
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

/** Applies {@link planTabsCreate} in memory for a single persistence write. */
export function buildBlocksForTabsCreate(
  blocks: Block[],
  rows: CanvasRow[],
  rowId: string,
  count: number,
  seedTextOverride?: string
): { blocks: Block[]; focusRowId: string | null } {
  const effects = planTabsCreate(rows, rowId, count, seedTextOverride);
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

  const tabsRow = buildBlockTree(workingBlocks).find(
    (row) => row.rowId === rowId
  );
  const firstTabTextRowId =
    tabsRow?.children[0]?.children[0]?.rowId ?? focusRowId;

  return { blocks: workingBlocks, focusRowId: firstTabTextRowId };
}

/** Unwrap a tabs container: hoist every tab's children to the tabs' canvas parent. */
export function planTabsUnwrap(
  rows: CanvasRow[],
  tabsRowId: string,
  options?: { excludeTabRowIds?: string[] }
): CanvasEffect[] {
  const ctx = findRowContext(rows, tabsRowId);
  if (ctx?.row.effectiveBlock.type !== "tabs") {
    return [];
  }

  const tabsBlock = ctx.row.effectiveBlock;
  const parentId = tabsBlock.parentId ?? null;
  const excludedTabRowIds = new Set(options?.excludeTabRowIds ?? []);
  const tabChildren = ctx.row.children.filter(
    (tabRow) => !excludedTabRowIds.has(tabRow.rowId)
  );

  if (tabChildren.length === 0) {
    const placement = placementAfterRow(rows, tabsRowId);
    const effects: CanvasEffect[] = [{ type: "delete", rowId: tabsRowId }];
    for (const excludedRowId of excludedTabRowIds) {
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
  for (const tabRow of tabChildren) {
    for (const child of tabRow.children) {
      flatContent.push(child);
    }
  }

  const effects: CanvasEffect[] = [];
  let anchorRowId: string | undefined;
  const placementBase =
    resolveRowPlacementPlan(rows, tabsRowId, "before") ??
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

  for (const tabRow of tabChildren) {
    effects.push({ type: "delete", rowId: tabRow.rowId });
  }
  effects.push({ type: "delete", rowId: tabsRowId });

  const firstMoved = flatContent[0];
  if (firstMoved) {
    effects.push({
      type: "focus",
      rowId: firstMoved.rowId,
      placement: "start",
    });
  }

  for (const excludedRowId of excludedTabRowIds) {
    effects.push({ type: "delete", rowId: excludedRowId });
  }

  return effects;
}

/** Append a tab with one empty text row. */
export function planTabsAddTab(
  rows: CanvasRow[],
  tabsRowId: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, tabsRowId);
  if (ctx?.row.effectiveBlock.type !== "tabs") {
    return [];
  }

  if (ctx.row.children.length >= MAX_TABS_COUNT) {
    return [];
  }

  const tabBlock = buildTabBlock(
    tabsRowId,
    defaultTabLabel(ctx.row.children.length)
  );
  const lastTab = ctx.row.children.at(-1);
  const tabPlacement = lastTab
    ? {
        parentId: tabsRowId,
        anchorRowId: lastTab.rowId,
        edge: "after" as const,
      }
    : { parentId: tabsRowId, atScopeStart: true as const };

  const textBlock = createEmptyBlock("text");
  textBlock.parentId = tabBlock.id;

  return [
    {
      type: "insert",
      position: tabPlacement,
      block: tabBlock,
      focus: false,
    },
    {
      type: "insert",
      position: { parentId: tabBlock.id, atScopeStart: true },
      block: textBlock,
      focus: true,
    },
  ];
}

/** Remove a tab; unwrap when fewer than MIN_TABS_COUNT remain. */
export function planTabsRemoveTab(
  rows: CanvasRow[],
  tabRowId: string
): CanvasEffect[] {
  const ctx = findRowContext(rows, tabRowId);
  if (ctx?.row.effectiveBlock.type !== "tab") {
    return [];
  }

  const tabsParent = ctx.parent;
  if (tabsParent?.effectiveBlock.type !== "tabs") {
    return [];
  }

  const remainingCount = tabsParent.children.length - 1;
  if (remainingCount < MIN_TABS_COUNT) {
    return planTabsUnwrap(rows, tabsParent.rowId, {
      excludeTabRowIds: [tabRowId],
    });
  }

  const effects: CanvasEffect[] = [{ type: "delete", rowId: tabRowId }];
  const tabIndex = tabsParent.children.findIndex(
    (tabRow) => tabRow.rowId === tabRowId
  );
  const focusTab =
    tabsParent.children[tabIndex - 1] ?? tabsParent.children[tabIndex + 1];
  const focusRow = focusTab?.children.at(-1) ?? focusTab?.children.at(0);
  if (focusRow) {
    effects.push({
      type: "focus",
      rowId: focusRow.rowId,
      placement: "end",
    });
  }

  return effects;
}
