import { isContainerBlockType } from "@/lib/blocks/block-defs.ts";
import {
  clampBlockIndent,
  getBlockIndent,
  withBlockIndent,
} from "@/lib/blocks/block-indent.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { findRowById, findRowContext } from "@/lib/blocks/block-tree.ts";
import {
  buildContainerChildBlock,
  buildWrappedContainerBlock,
  convertBlockType,
  createEmptyBlock,
  getTextFromBlock,
  withBlockText,
} from "@/lib/blocks/create-block.ts";
import { coerceContainerChildBlock } from "@/lib/blocks/normalize-block.ts";
import { blocksFromRows } from "@/lib/blocks/page-block-mutations.ts";
import {
  placementAfterRow,
  resolveRowMovePlan,
  resolveRowPlacementPlan,
  resolveScopeStartPlacement,
} from "@/lib/blocks/row-placement.ts";
import {
  acceptsEmptyMergeFromAfter,
  isAllowedChild,
  isContainerType,
} from "@/lib/canvas/block-container-config.ts";
import {
  canSplitBlock,
  conversionStaysInContainer,
  resolveContainerChildInsertType,
  shouldLiftContainerChildOnEnterAtCaretStart,
  shouldLiftConversionFromContainer,
} from "@/lib/canvas/block-interactions.ts";
import {
  expandRowIdsForDelete,
  rowIdsInReverseDocumentOrder,
} from "@/lib/canvas/block-selection.ts";
import { cloneBlocksForPaste } from "@/lib/canvas/clipboard.ts";
import {
  buildBlocksForColumnsCreate,
  planColumnsAddColumn,
  planColumnsRemoveColumn,
} from "@/lib/canvas/columns-layout.ts";
import { assertNever, type CanvasCommand } from "@/lib/canvas/commands.ts";
import { planLiftContainerChildConversion } from "@/lib/canvas/container-child-conversion.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import {
  findFocusableAdjacentRow,
  flattenCanvasRows,
} from "@/lib/canvas/focusable-rows.ts";
import {
  buildBlocksForTableCreate,
  planTableAddColumn,
  planTableAddRow,
  planTableDuplicateColumn,
  planTableFitToWidth,
  planTableFocusAdjacentCell,
  planTableRemoveColumn,
  planTableRemoveRow,
  planTableReorderColumn,
  planTableToggleHeaderColumn,
  planTableToggleHeaderRow,
  planTableUpdateColumnWidths,
} from "@/lib/canvas/table-layout.ts";
import {
  buildBlocksForTabsCreate,
  planTabsAddTab,
  planTabsMoveTab,
  planTabsRemoveTab,
} from "@/lib/canvas/tabs-layout.ts";
import {
  planToggleHeadingCreate,
  planToggleHeadingUnwrap,
} from "@/lib/canvas/toggle-heading-layout.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

/**
 * Canvas command reducer: maps {@link CanvasCommand} to {@link CanvasEffect}[] without React or I/O.
 * @see docs/architecture/canvas-editor.md
 * @see docs/reference/canvas-commands.md
 */

export interface CanvasReducerState {
  rows: CanvasRow[];
}

export interface ReducerResult {
  effects: CanvasEffect[];
  state: CanvasReducerState;
}

/** Coerce a pasted subtree root to a type the destination scope accepts. */
function coercePastedRootBlock(
  block: Block,
  destinationType: BlockType | null
): Block {
  if (destinationType && isContainerType(destinationType)) {
    return isAllowedChild(destinationType, block.type)
      ? block
      : coerceContainerChildBlock(block, destinationType);
  }

  // Container-child-only types cannot stand alone at the top level.
  if (block.type === "checklistItem" || block.type === "column") {
    return {
      id: block.id,
      type: "text",
      parentId: block.parentId ?? null,
      indent: block.indent,
      props: { text: getTextFromBlock(block) },
    };
  }

  return block;
}

/**
 * Plan inserts for pasted blocks (already cloned with remapped ids), keeping
 * container subtrees intact. Blocks whose parent is outside the pasted set are
 * roots placed sequentially at the target; descendants keep their parents.
 */
function structuredPasteEffects(
  rows: CanvasRow[],
  targetRowId: string,
  blocks: Block[],
  edge: "before" | "after" = "after"
): CanvasEffect[] {
  if (blocks.length === 0) {
    return [];
  }

  const rootPlan = resolveRowPlacementPlan(rows, targetRowId, edge);
  if (!rootPlan) {
    return [];
  }

  const destinationParentId = rootPlan.parentId;
  const destinationType = destinationParentId
    ? (findRowById(rows, destinationParentId)?.effectiveBlock.type ?? null)
    : null;

  const idSet = new Set(blocks.map((block) => block.id));
  const effects: CanvasEffect[] = [];
  const lastInsertedByParent = new Map<string, string>();
  let lastRootId: string | null = null;

  for (const block of blocks) {
    const isRoot = !(block.parentId && idSet.has(block.parentId));

    if (isRoot) {
      const placed = coercePastedRootBlock(
        { ...block, parentId: destinationParentId },
        destinationType
      );
      effects.push({
        type: "insert",
        position: lastRootId
          ? {
              parentId: destinationParentId,
              anchorRowId: lastRootId,
              edge: "after",
            }
          : rootPlan,
        block: placed,
        focus: false,
      });
      lastRootId = placed.id;
      continue;
    }

    const parentId = block.parentId as string;
    const previousSibling = lastInsertedByParent.get(parentId);
    effects.push({
      type: "insert",
      position: previousSibling
        ? { parentId, anchorRowId: previousSibling, edge: "after" }
        : { parentId, atScopeStart: true },
      block,
      focus: false,
    });
    lastInsertedByParent.set(parentId, block.id);
  }

  const lastEffect = effects.at(-1);
  if (lastEffect?.type === "insert") {
    lastEffect.focus = true;
  }

  return effects;
}

/** Pure reducer for all canvas structural and focus commands. Prefer in-place persist/move over delete+insert with the same block id. */
export function canvasReducer(
  state: CanvasReducerState,
  command: CanvasCommand
): ReducerResult {
  const effects: CanvasEffect[] = [];

  switch (command.type) {
    case "row.update": {
      effects.push({
        type: "persist",
        rowId: command.rowId,
        block: command.block,
      });
      return { state, effects };
    }

    case "row.insert": {
      let block: Block;
      if (command.blockType === "pageLink" && command.pageId) {
        block = convertBlockType(createEmptyBlock("text"), "pageLink", {
          indent: command.indent,
          pageId: command.pageId,
          pageLinkVariant: command.pageLinkVariant,
        });
      } else {
        block = createEmptyBlock(command.blockType ?? "text");
        if (command.indent !== undefined) {
          block.indent = command.indent;
        }
        if (command.initialText) {
          block = withBlockText(block, command.initialText);
        }
      }
      if (command.position.parentId) {
        block.parentId = command.position.parentId;
      }
      effects.push({
        type: "insert",
        position: command.position,
        block,
        focus: true,
      });
      return { state, effects };
    }

    case "row.delete": {
      effects.push({ type: "delete", rowId: command.rowId });
      return { state, effects };
    }

    case "selection.delete": {
      const rowIds = expandRowIdsForDelete(state.rows, command.rowIds);
      for (const rowId of rowIdsInReverseDocumentOrder(state.rows, rowIds)) {
        effects.push({ type: "delete", rowId });
      }
      return { state, effects };
    }

    case "rows.paste": {
      return {
        state,
        effects: structuredPasteEffects(
          state.rows,
          command.targetRowId,
          cloneBlocksForPaste(command.blocks),
          command.edge ?? "after"
        ),
      };
    }

    case "row.split": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
      }
      const block = ctx.row.effectiveBlock;
      if (!canSplitBlock(block)) {
        return { state, effects };
      }

      const text = getTextFromBlock(block);
      const start = Math.min(command.start, text.length);
      const end = Math.min(command.end, text.length);
      const indent = getBlockIndent(block);
      const parentId = block.parentId ?? null;
      const containerParent =
        ctx.parent && isContainerBlockType(ctx.parent.effectiveBlock.type)
          ? ctx.parent
          : null;

      if (start === 0 && end === 0) {
        if (
          containerParent &&
          shouldLiftContainerChildOnEnterAtCaretStart(containerParent)
        ) {
          return canvasReducer(state, {
            type: "block.liftAsText",
            rowId: command.rowId,
          });
        }

        const placement =
          text.length === 0
            ? placementAfterRow(state.rows, command.rowId)
            : resolveRowPlacementPlan(state.rows, command.rowId, "before");
        if (!placement) {
          return { state, effects };
        }

        const insertType =
          block.type === "heading" || text.length === 0 ? "text" : block.type;
        const childType = resolveContainerChildInsertType(
          containerParent,
          insertType
        );
        const insertedBlock = createEmptyBlock(childType);
        insertedBlock.indent = indent;
        if (parentId) {
          insertedBlock.parentId = parentId;
        }

        const focusOriginalRow = text.length > 0;
        effects.push({
          type: "insert",
          position: placement,
          block: insertedBlock,
          focus: !focusOriginalRow,
        });
        if (focusOriginalRow) {
          effects.push({
            type: "focus",
            rowId: command.rowId,
            placement: "start",
          });
        }
        return { state, effects };
      }

      const before = text.slice(0, start);
      const after = text.slice(end);

      effects.push({
        type: "persist",
        rowId: command.rowId,
        block: withBlockText(block, before),
      });

      const preferredNextType = after.length > 0 ? block.type : "text";
      const nextType = resolveContainerChildInsertType(
        containerParent,
        preferredNextType
      );
      let nextBlock = createEmptyBlock(nextType);
      if (nextType === "heading" && block.type === "heading") {
        nextBlock = {
          ...nextBlock,
          props: { ...nextBlock.props, level: block.props.level },
        } as Block;
      }
      nextBlock = withBlockText(nextBlock, after);
      nextBlock.indent = indent;
      if (parentId) {
        nextBlock.parentId = parentId;
      }

      const placement = placementAfterRow(state.rows, command.rowId);
      if (!placement) {
        return { state, effects };
      }

      effects.push({
        type: "insert",
        position: placement,
        block: nextBlock,
        focus: true,
      });
      return { state, effects };
    }

    case "row.move": {
      const plan = resolveRowMovePlan(
        state.rows,
        command.rowId,
        command.targetRowId,
        command.edge
      );
      if (!plan) {
        return { state, effects };
      }
      effects.push({
        type: "move",
        rowId: command.rowId,
        position: plan.position,
      });
      effects.push({ type: "focus", rowId: command.rowId, placement: "start" });
      return { state, effects };
    }

    case "row.moveToPosition": {
      effects.push({
        type: "move",
        rowId: command.rowId,
        position: command.position,
      });
      effects.push({ type: "focus", rowId: command.rowId, placement: "start" });
      return { state, effects };
    }

    case "row.convert": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
      }

      // Converting a toggle heading to a leaf (heading/text/…) lifts its
      // children out as following siblings, in order.
      if (
        ctx.row.effectiveBlock.type === "toggleHeading" &&
        command.to !== "toggleHeading"
      ) {
        const converted = convertBlockType(ctx.row.effectiveBlock, command.to, {
          text: command.options?.text,
          indent: command.options?.indent,
          headingLevel: command.options?.headingLevel,
          pageId: command.options?.pageId,
          pageLinkVariant: command.options?.pageLinkVariant,
        });
        return {
          state,
          effects: planToggleHeadingUnwrap(
            state.rows,
            command.rowId,
            converted
          ),
        };
      }

      const containerParent =
        ctx.parent && isContainerBlockType(ctx.parent.effectiveBlock.type)
          ? ctx.parent
          : null;
      const staysInContainer =
        containerParent &&
        conversionStaysInContainer(
          containerParent,
          ctx.row.effectiveBlock.type,
          command.to
        );

      if (staysInContainer) {
        const converted = convertBlockType(ctx.row.effectiveBlock, command.to, {
          text: command.options?.text,
          indent: command.options?.indent,
          headingLevel: command.options?.headingLevel,
          pageId: command.options?.pageId,
          pageLinkVariant: command.options?.pageLinkVariant,
        });
        effects.push({
          type: "persist",
          rowId: command.rowId,
          block: converted,
        });
        effects.push({
          type: "focus",
          rowId: command.rowId,
          placement: "start",
        });
        return { state, effects };
      }

      const converted = convertBlockType(ctx.row.effectiveBlock, command.to, {
        text: command.options?.text,
        indent: command.options?.indent,
        headingLevel: command.options?.headingLevel,
        pageId: command.options?.pageId,
        pageLinkVariant: command.options?.pageLinkVariant,
      });

      if (shouldLiftConversionFromContainer(containerParent, command.to)) {
        if (!containerParent) {
          return { state, effects };
        }
        // Type-restricted containers (list, checklist) reject the new type, so
        // the converted block is lifted out as a following sibling.
        converted.parentId = containerParent.effectiveBlock.parentId ?? null;
        effects.push(
          ...planLiftContainerChildConversion(
            state.rows,
            {
              row: ctx.row,
              parent: containerParent,
              index: ctx.index,
            },
            converted
          )
        );
        effects.push({
          type: "focus",
          rowId: converted.id,
          placement: "start",
        });
        return { state, effects };
      }

      // Convert in place. Top-level rows stay at the top level; children of
      // generic-scope containers (toggle heading, column, tab) keep their
      // parent, so the converted block stays nested. `convertBlockType` already
      // preserves the source block's `parentId`.
      effects.push({ type: "persist", rowId: command.rowId, block: converted });
      effects.push({
        type: "focus",
        rowId: command.rowId,
        placement: "start",
      });
      return { state, effects };
    }

    case "indent.adjust": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
      }
      const next = withBlockIndent(
        ctx.row.effectiveBlock,
        clampBlockIndent(getBlockIndent(ctx.row.effectiveBlock) + command.delta)
      );
      effects.push({ type: "persist", rowId: command.rowId, block: next });
      return { state, effects };
    }

    case "block.mergeTextIntoPreviousSibling": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx?.index || ctx.index <= 0) {
        return { state, effects };
      }
      const previous = ctx.siblings[ctx.index - 1];
      if (!previous) {
        return { state, effects };
      }
      const previousText = getTextFromBlock(previous.effectiveBlock);
      const merged = withBlockText(
        previous.effectiveBlock,
        previousText + getTextFromBlock(ctx.row.effectiveBlock)
      );
      effects.push({
        type: "persist",
        rowId: previous.rowId,
        block: merged,
      });
      effects.push({ type: "delete", rowId: command.rowId });
      effects.push({
        type: "focus",
        rowId: previous.rowId,
        offset: previousText.length,
      });
      return { state, effects };
    }

    case "block.mergeIntoPreviousCanvasRow": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
      }
      const flatIndex = state.rows.findIndex((r) => r.rowId === command.rowId);
      const containerRow = ctx.parent ?? state.rows[flatIndex - 1];
      if (
        !(
          containerRow &&
          acceptsEmptyMergeFromAfter(containerRow.effectiveBlock.type)
        )
      ) {
        return { state, effects };
      }
      const lastChild = containerRow.children.at(-1);
      if (lastChild) {
        const lastChildText = getTextFromBlock(lastChild.effectiveBlock);
        const merged = withBlockText(
          lastChild.effectiveBlock,
          lastChildText + getTextFromBlock(ctx.row.effectiveBlock)
        );
        effects.push({
          type: "persist",
          rowId: lastChild.rowId,
          block: merged,
        });
        effects.push({ type: "delete", rowId: command.rowId });
        effects.push({
          type: "focus",
          rowId: lastChild.rowId,
          offset: lastChildText.length,
        });
        return { state, effects };
      }
      effects.push({ type: "delete", rowId: command.rowId });
      return { state, effects };
    }

    case "block.liftAsText": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
      }
      const text = getTextFromBlock(ctx.row.effectiveBlock);
      const indent = getBlockIndent(ctx.row.effectiveBlock);
      const containerParent =
        ctx.parent && isContainerBlockType(ctx.parent.effectiveBlock.type)
          ? ctx.parent
          : null;

      if (containerParent) {
        const textBlock = convertBlockType(ctx.row.effectiveBlock, "text", {
          text,
          indent,
        });
        textBlock.parentId = containerParent.effectiveBlock.parentId ?? null;
        effects.push(
          ...planLiftContainerChildConversion(
            state.rows,
            {
              row: ctx.row,
              parent: containerParent,
              index: ctx.index,
            },
            textBlock
          )
        );
        return { state, effects };
      }

      const textBlock = convertBlockType(ctx.row.effectiveBlock, "text", {
        text,
        indent,
      });
      textBlock.parentId = null;
      effects.push({
        type: "persist",
        rowId: command.rowId,
        block: textBlock,
      });
      effects.push({
        type: "focus",
        rowId: command.rowId,
        placement: "start",
        offset: 0,
      });
      return { state, effects };
    }

    case "container.unwrap": {
      const ctx = findRowContext(state.rows, command.containerRowId);
      if (!ctx) {
        return { state, effects };
      }
      if (ctx.row.children.length === 0) {
        effects.push({ type: "delete", rowId: command.containerRowId });
        const placement = placementAfterRow(state.rows, command.containerRowId);
        if (placement) {
          effects.push({
            type: "insert",
            position: placement,
            block: createEmptyBlock("text"),
            focus: true,
          });
        }
      }
      return { state, effects };
    }

    case "columns.create": {
      const flatBlocks = blocksFromRows(state.rows);
      const { blocks, focusRowId } = buildBlocksForColumnsCreate(
        flatBlocks,
        state.rows,
        command.rowId,
        command.count,
        command.text
      );
      if (!focusRowId) {
        return { state, effects };
      }

      effects.push({
        type: "columns.apply",
        blocks,
        focusRowId,
      });
      return { state, effects };
    }

    case "columns.addColumn": {
      return {
        state,
        effects: planColumnsAddColumn(state.rows, command.columnsRowId),
      };
    }

    case "columns.removeColumn": {
      return {
        state,
        effects: planColumnsRemoveColumn(state.rows, command.columnRowId),
      };
    }

    case "tabs.create": {
      const flatBlocks = blocksFromRows(state.rows);
      const { blocks, focusRowId } = buildBlocksForTabsCreate(
        flatBlocks,
        state.rows,
        command.rowId,
        command.count,
        command.text
      );
      if (!focusRowId) {
        return { state, effects };
      }

      effects.push({
        type: "tabs.apply",
        blocks,
        focusRowId,
      });
      return { state, effects };
    }

    case "toggleHeading.create": {
      return {
        state,
        effects: planToggleHeadingCreate(
          state.rows,
          command.rowId,
          command.level,
          {
            seedText: command.text,
            absorb: command.absorb,
          }
        ),
      };
    }

    case "tabs.addTab": {
      return {
        state,
        effects: planTabsAddTab(state.rows, command.tabsRowId),
      };
    }

    case "tabs.removeTab": {
      return {
        state,
        effects: planTabsRemoveTab(state.rows, command.tabRowId),
      };
    }

    case "tabs.moveTab": {
      return {
        state,
        effects: planTabsMoveTab(
          state.rows,
          command.tabRowId,
          command.direction
        ),
      };
    }

    case "table.create": {
      const flatBlocks = blocksFromRows(state.rows);
      const { blocks, focusRowId } = buildBlocksForTableCreate(
        flatBlocks,
        state.rows,
        command.rowId,
        {
          columns: command.columns,
          rows: command.rows,
          hasHeaderRow: command.hasHeaderRow,
          seedText: command.text,
        }
      );
      if (!focusRowId) {
        return { state, effects };
      }

      effects.push({
        type: "table.apply",
        blocks,
        focusRowId,
      });
      return { state, effects };
    }

    case "table.addRow": {
      return {
        state,
        effects: planTableAddRow(
          state.rows,
          command.tableRowId,
          command.edge ?? "after",
          { focus: command.focus }
        ),
      };
    }

    case "table.addColumn": {
      return {
        state,
        effects: planTableAddColumn(
          state.rows,
          command.tableId,
          command.columnIndex,
          command.edge,
          { focus: command.focus }
        ),
      };
    }

    case "table.removeRow": {
      return {
        state,
        effects: planTableRemoveRow(state.rows, command.tableRowId),
      };
    }

    case "table.removeColumn": {
      return {
        state,
        effects: planTableRemoveColumn(
          state.rows,
          command.tableId,
          command.columnIndex
        ),
      };
    }

    case "table.duplicateColumn": {
      return {
        state,
        effects: planTableDuplicateColumn(
          state.rows,
          command.tableId,
          command.columnIndex
        ),
      };
    }

    case "table.reorderColumn": {
      return {
        state,
        effects: planTableReorderColumn(
          state.rows,
          command.tableId,
          command.fromIndex,
          command.toIndex
        ),
      };
    }

    case "table.toggleHeaderRow": {
      return {
        state,
        effects: planTableToggleHeaderRow(
          state.rows,
          command.tableId,
          command.enabled
        ),
      };
    }

    case "table.toggleHeaderColumn": {
      return {
        state,
        effects: planTableToggleHeaderColumn(
          state.rows,
          command.tableId,
          command.enabled
        ),
      };
    }

    case "table.fitToWidth": {
      return {
        state,
        effects: planTableFitToWidth(
          state.rows,
          command.tableId,
          command.targetWidthPx
        ),
      };
    }

    case "table.updateColumnWidths": {
      return {
        state,
        effects: planTableUpdateColumnWidths(
          state.rows,
          command.tableId,
          command.columnWidths
        ),
      };
    }

    case "table.focusCell": {
      return {
        state,
        effects: planTableFocusAdjacentCell(
          state.rows,
          command.cellRowId,
          command.direction
        ),
      };
    }

    case "container.wrap": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
      }
      const sourceBlock = ctx.row.effectiveBlock;
      const containerParent =
        ctx.parent && isContainerBlockType(ctx.parent.effectiveBlock.type)
          ? ctx.parent
          : null;

      // Generic-scope parents (toggle heading, column, tab) accept the new
      // container as a child, so it is built in place. Type-restricted parents
      // (list, checklist) reject it, so the row is lifted out first.
      if (
        containerParent &&
        !isAllowedChild(
          containerParent.effectiveBlock.type,
          command.containerType
        )
      ) {
        const childText = command.childText ?? getTextFromBlock(sourceBlock);
        const textBlock = convertBlockType(sourceBlock, "text", {
          text: childText,
        });
        textBlock.parentId = containerParent.effectiveBlock.parentId ?? null;
        effects.push(
          ...planLiftContainerChildConversion(
            state.rows,
            {
              row: ctx.row,
              parent: containerParent,
              index: ctx.index,
            },
            textBlock
          )
        );

        const containerId = command.rowId;
        const wrappedContainerBlock = buildWrappedContainerBlock(
          command.containerType,
          containerId,
          {
            indent: getBlockIndent(sourceBlock),
            parentId: textBlock.parentId,
            variant: command.variant,
          }
        );
        const child = buildContainerChildBlock(
          command.containerType,
          containerId,
          {
            text: childText,
          }
        );
        effects.push({
          type: "persist",
          rowId: containerId,
          block: wrappedContainerBlock,
        });
        effects.push({
          type: "insert",
          position: { parentId: containerId, atScopeStart: true },
          block: child,
          focus: true,
        });
        return { state, effects };
      }

      const containerId = command.rowId;
      const childText = command.childText ?? getTextFromBlock(sourceBlock);
      const wrappedContainerBlock = buildWrappedContainerBlock(
        command.containerType,
        containerId,
        {
          indent: getBlockIndent(sourceBlock),
          parentId: sourceBlock.parentId ?? null,
          variant: command.variant,
        }
      );
      const child = buildContainerChildBlock(
        command.containerType,
        containerId,
        {
          text: childText,
        }
      );
      effects.push({
        type: "persist",
        rowId: command.rowId,
        block: wrappedContainerBlock,
      });
      effects.push({
        type: "insert",
        position: resolveScopeStartPlacement(state.rows, containerId),
        block: child,
        focus: true,
      });
      return { state, effects };
    }

    case "slash.convert": {
      if (command.to === "columns") {
        return canvasReducer(state, {
          type: "columns.create",
          rowId: command.rowId,
          count: 2,
          text: command.text,
        });
      }

      if (command.to === "table") {
        return canvasReducer(state, {
          type: "table.create",
          rowId: command.rowId,
          columns: 3,
          rows: 3,
          text: command.text,
        });
      }

      return canvasReducer(state, {
        type: "row.convert",
        rowId: command.rowId,
        to: command.to,
        options: {
          text: command.text,
          headingLevel: command.headingLevel,
          pageId: command.pageId,
          pageLinkVariant: command.pageLinkVariant,
        },
      });
    }

    case "focus.set": {
      effects.push({
        type: "focus",
        rowId: command.rowId,
        placement: command.placement,
        offset: command.offset,
        embedAction: command.embedAction,
      });
      return { state, effects };
    }

    case "row.moveAdjacent": {
      const flat = flattenCanvasRows(state.rows);
      const index = flat.findIndex((r) => r.rowId === command.rowId);
      if (index === -1) {
        return { state, effects };
      }
      const adjacent = findFocusableAdjacentRow(flat, index, command.direction);
      if (!adjacent) {
        return { state, effects };
      }
      return canvasReducer(state, {
        type: "row.move",
        rowId: command.rowId,
        targetRowId: adjacent.rowId,
        edge: command.direction === "up" ? "before" : "after",
      });
    }

    case "row.focusAdjacent": {
      const flat = flattenCanvasRows(state.rows);
      const index = flat.findIndex((r) => r.rowId === command.rowId);
      if (index === -1) {
        return { state, effects };
      }
      const adjacent = findFocusableAdjacentRow(flat, index, command.direction);
      if (adjacent) {
        effects.push({
          type: "focus",
          rowId: adjacent.rowId,
          placement: command.direction === "up" ? "end" : "start",
        });
      }
      return { state, effects };
    }

    case "page.revertToServer": {
      effects.push({ type: "page.revertToServer" });
      return { state, effects };
    }

    case "page.acknowledgeServerBaseline": {
      effects.push({ type: "page.acknowledgeServerBaseline" });
      return { state, effects };
    }

    default:
      return assertNever(command);
  }
}
