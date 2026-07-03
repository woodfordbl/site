import {
  type ContainerBlockType,
  isContainerBlockType,
} from "@/lib/blocks/block-defs.ts";
import type { ContainerDefinition } from "@/lib/canvas/block-spec.types.ts";
import type { BlockType } from "@/lib/schemas/block.ts";

export const BLOCK_CONTAINER_CONFIG: Record<
  ContainerBlockType,
  ContainerDefinition
> = {
  list: {
    allowedChildTypes: ["text"],
    defaultChildType: "text",
    onDisallowedChildConversion: "lift-out",
    onEmptyChildDelete: "lift-out",
    onEmptyChildEnter: "lift-out",
    onCaretStartChildEnter: "lift-out",
    insertSiblingOnEnter: true,
    acceptEmptyMergeFromAfter: true,
    selectChildrenAsUnit: true,
  },
  checklist: {
    allowedChildTypes: ["checklistItem"],
    defaultChildType: "checklistItem",
    onDisallowedChildConversion: "lift-out",
    onEmptyChildDelete: "lift-out",
    onEmptyChildEnter: "lift-out",
    onCaretStartChildEnter: "lift-out",
    insertSiblingOnEnter: true,
    acceptEmptyMergeFromAfter: true,
    selectChildrenAsUnit: true,
  },
  columns: {
    allowedChildTypes: ["column"],
    defaultChildType: "column",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "delete",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: false,
    acceptEmptyMergeFromAfter: false,
  },
  column: {
    allowedChildTypes: "*",
    defaultChildType: "text",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "delete",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: true,
    acceptEmptyMergeFromAfter: true,
    scopedContent: true,
  },
  tabs: {
    allowedChildTypes: ["tab"],
    defaultChildType: "tab",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "delete",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: false,
    acceptEmptyMergeFromAfter: false,
  },
  tab: {
    allowedChildTypes: "*",
    defaultChildType: "text",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "delete",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: true,
    acceptEmptyMergeFromAfter: true,
    scopedContent: true,
  },
  table: {
    allowedChildTypes: ["tableRow"],
    defaultChildType: "tableRow",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "delete",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: false,
    acceptEmptyMergeFromAfter: false,
  },
  tableRow: {
    allowedChildTypes: ["tableCell"],
    defaultChildType: "tableCell",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "delete",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: false,
    acceptEmptyMergeFromAfter: false,
  },
  toggleHeading: {
    // Generic-scope container (like `column`/`tab`) holding the heading's
    // content as children. Emptying-and-deleting the first child lifts it out
    // after the toggle rather than orphaning it.
    allowedChildTypes: "*",
    defaultChildType: "text",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "lift-out",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: true,
    acceptEmptyMergeFromAfter: true,
    scopedContent: true,
  },
  callout: {
    // Generic-scope container (like `toggleHeading`) holding the callout body
    // as children. Backspacing the empty sole child lifts it out, dissolving
    // the callout rather than orphaning content.
    allowedChildTypes: "*",
    defaultChildType: "text",
    onDisallowedChildConversion: "prevent",
    onEmptyChildDelete: "lift-out",
    onEmptyChildEnter: "insert-sibling",
    onCaretStartChildEnter: "insert-sibling",
    insertSiblingOnEnter: true,
    acceptEmptyMergeFromAfter: true,
    scopedContent: true,
  },
};

export function getContainerDefinition(
  type: BlockType
): ContainerDefinition | undefined {
  return isContainerBlockType(type) ? BLOCK_CONTAINER_CONFIG[type] : undefined;
}

export function isContainerType(type: BlockType): type is ContainerBlockType {
  return isContainerBlockType(type);
}

export function acceptsEmptyMergeFromAfter(type: BlockType): boolean {
  return getContainerDefinition(type)?.acceptEmptyMergeFromAfter ?? false;
}

export function defaultChildTypeForContainer(type: BlockType): BlockType {
  return getContainerDefinition(type)?.defaultChildType ?? "text";
}

export function canInsertSiblingInContainer(type: BlockType): boolean {
  return getContainerDefinition(type)?.insertSiblingOnEnter ?? false;
}

export function shouldLiftEmptyChildOnEnter(type: BlockType): boolean {
  return getContainerDefinition(type)?.onEmptyChildEnter === "lift-out";
}

export function shouldLiftChildOnEnterAtCaretStart(type: BlockType): boolean {
  return getContainerDefinition(type)?.onCaretStartChildEnter === "lift-out";
}

export function shouldLiftEmptyChildOnDelete(type: BlockType): boolean {
  return getContainerDefinition(type)?.onEmptyChildDelete === "lift-out";
}

export function shouldLiftDisallowedChildConversion(type: BlockType): boolean {
  return (
    getContainerDefinition(type)?.onDisallowedChildConversion === "lift-out"
  );
}

/** True when `type` renders its children inside a `data-canvas-scope` wrapper. */
export function hasScopedContent(type: BlockType): boolean {
  return getContainerDefinition(type)?.scopedContent === true;
}

/** True when clicking/marqueeing `type` selects its child rows as a unit. */
export function selectsChildrenAsUnit(type: BlockType): boolean {
  return getContainerDefinition(type)?.selectChildrenAsUnit === true;
}

export function isAllowedChild(
  containerType: BlockType,
  childType: BlockType
): boolean {
  const def = getContainerDefinition(containerType);
  if (!def) {
    return false;
  }
  if (def.allowedChildTypes === "*") {
    return true;
  }
  return def.allowedChildTypes.includes(childType);
}
