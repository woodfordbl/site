import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import {
  defaultChildTypeForContainer,
  isAllowedChild,
  shouldLiftChildOnEnterAtCaretStart,
  shouldLiftDisallowedChildConversion,
  shouldLiftEmptyChildOnDelete,
  shouldLiftEmptyChildOnEnter,
} from "@/lib/canvas/block-container-config.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export function canSplitBlock(block: Block): boolean {
  return (
    block.type === "heading" ||
    block.type === "text" ||
    block.type === "quote" ||
    block.type === "callout" ||
    block.type === "checklistItem"
  );
}

export function getContainerParent(row: CanvasRow | null): CanvasRow | null {
  return row?.children ? row : null;
}

export function shouldLiftEmptyContainerChildOnEnter(
  parent: CanvasRow | null,
  block: Block
): boolean {
  if (!parent) {
    return false;
  }
  return (
    getTextFromBlock(block).length === 0 &&
    shouldLiftEmptyChildOnEnter(parent.effectiveBlock.type)
  );
}

export function shouldLiftContainerChildOnEnterAtCaretStart(
  parent: CanvasRow | null
): boolean {
  if (!parent) {
    return false;
  }
  return shouldLiftChildOnEnterAtCaretStart(parent.effectiveBlock.type);
}

export function shouldLiftEmptyContainerChildOnDelete(
  parent: CanvasRow | null
): boolean {
  return parent
    ? shouldLiftEmptyChildOnDelete(parent.effectiveBlock.type)
    : false;
}

export function conversionStaysInContainer(
  parent: CanvasRow | null,
  currentType: BlockType,
  nextType: BlockType
): boolean {
  if (!parent) {
    return false;
  }
  if (!isAllowedChild(parent.effectiveBlock.type, nextType)) {
    return false;
  }
  return currentType === nextType;
}

export function shouldLiftConversionFromContainer(
  parent: CanvasRow | null,
  nextType: BlockType
): boolean {
  if (!parent) {
    return false;
  }
  return (
    !isAllowedChild(parent.effectiveBlock.type, nextType) &&
    shouldLiftDisallowedChildConversion(parent.effectiveBlock.type)
  );
}

export function resolveContainerChildInsertType(
  parent: CanvasRow | null,
  preferredType: BlockType
): BlockType {
  if (!parent || isAllowedChild(parent.effectiveBlock.type, preferredType)) {
    return preferredType;
  }
  return defaultChildTypeForContainer(parent.effectiveBlock.type);
}
