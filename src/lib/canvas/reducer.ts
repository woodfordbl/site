import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { findRowContext } from "@/db/queries/merge-blocks.ts";
import {
  clampBlockIndent,
  getBlockIndent,
  withBlockIndent,
} from "@/lib/blocks/block-indent.ts";
import {
  buildContainerChildBlock,
  buildWrappedContainerBlock,
  convertBlockType,
  createEmptyBlock,
  getTextFromBlock,
  withBlockText,
} from "@/lib/blocks/create-block.ts";
import {
  chainPlacementPlans,
  placementAfterRow,
  resolveRowMovePlan,
  resolveRowPlacementPlan,
  resolveScopeStartPlacement,
} from "@/lib/blocks/row-placement.ts";
import { acceptsEmptyMergeFromAfter } from "@/lib/canvas/block-container-config.ts";
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
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import { cloneBlocksForPaste } from "@/lib/canvas/clipboard.ts";
import { assertNever, type CanvasCommand } from "@/lib/canvas/commands.ts";
import { planLiftContainerChildConversion } from "@/lib/canvas/container-child-conversion.ts";
import type { CanvasEffect } from "@/lib/canvas/effects.ts";
import {
  findFocusableAdjacentRow,
  flattenCanvasRows,
} from "@/lib/canvas/focusable-rows.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * Canvas command reducer: maps {@link CanvasCommand} to {@link CanvasEffect}[] without React or I/O.
 * @see docs/architecture/canvas-editor.md
 * @see docs/reference/canvas-commands.md
 */

export interface CanvasReducerState {
  rows: CanvasRow[];
  serverBlocks: Block[];
}

export interface ReducerResult {
  effects: CanvasEffect[];
  state: CanvasReducerState;
}

function structuredPasteEffects(
  rows: CanvasRow[],
  targetRowId: string,
  blocks: Block[],
  edge: "before" | "after" = "after"
): CanvasEffect[] {
  if (blocks.length === 0) {
    return [];
  }

  const idSet = new Set(blocks.map((block) => block.id));
  const root =
    blocks.find((block) => !(block.parentId && idSet.has(block.parentId))) ??
    blocks[0];
  if (!root) {
    return [];
  }

  const rootPlan = resolveRowPlacementPlan(rows, targetRowId, edge);
  if (!rootPlan) {
    return [];
  }

  const effects: CanvasEffect[] = [
    {
      type: "insert",
      position: rootPlan,
      block: root,
      focus: false,
    },
  ];

  const lastInsertedByParent = new Map<string, string>();
  for (const block of blocks) {
    if (block.id === root.id) {
      continue;
    }

    const parentId = block.parentId;
    if (!parentId) {
      continue;
    }

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
      let block = createEmptyBlock(command.blockType ?? "text");
      if (command.indent !== undefined) {
        block.indent = command.indent;
      }
      if (command.initialText) {
        block = withBlockText(block, command.initialText);
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
      if (command.structured && command.blocks.length > 0) {
        return {
          state,
          effects: structuredPasteEffects(
            state.rows,
            command.targetRowId,
            command.blocks,
            command.edge ?? "after"
          ),
        };
      }

      const clonedBlocks = cloneBlocksForPaste(command.blocks);
      const inserts = chainPlacementPlans(
        state.rows,
        command.targetRowId,
        clonedBlocks,
        command.edge ?? "after"
      );
      for (const [index, insert] of inserts.entries()) {
        effects.push({
          type: "insert",
          position: insert.position,
          block: insert.block,
          focus: index === inserts.length - 1,
        });
      }
      return { state, effects };
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

        const insertType = text.length === 0 ? "text" : block.type;
        const childType = resolveContainerChildInsertType(
          containerParent,
          insertType
        );
        let insertedBlock = createEmptyBlock(childType);
        if (childType === "heading" && block.type === "heading") {
          insertedBlock = {
            ...insertedBlock,
            props: { ...insertedBlock.props, level: block.props.level },
          } as Block;
        }
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

    case "row.convert": {
      const ctx = findRowContext(state.rows, command.rowId);
      if (!ctx) {
        return { state, effects };
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
      });
      converted.parentId = containerParent?.effectiveBlock.parentId ?? null;

      if (shouldLiftConversionFromContainer(containerParent, command.to)) {
        if (!containerParent) {
          return { state, effects };
        }
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

      if (containerParent) {
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
      return canvasReducer(state, {
        type: "row.convert",
        rowId: command.rowId,
        to: command.to,
        options: {
          text: command.text,
          headingLevel: command.headingLevel,
          pageId: command.pageId,
        },
      });
    }

    case "focus.set": {
      effects.push({
        type: "focus",
        rowId: command.rowId,
        placement: command.placement,
        offset: command.offset,
      });
      return { state, effects };
    }

    case "focus.clear": {
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

    case "author.saveToSource":
    case "author.loadFromDisk":
      return { state, effects };

    default:
      return assertNever(command);
  }
}
