import type { ContainerDefinition } from "@/lib/canvas/block-spec.types.ts";
import type { BlockType } from "@/lib/schemas/block.ts";

export const BLOCK_CONTAINER_CONFIG: Partial<
  Record<BlockType, ContainerDefinition>
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
  },
};

export function getContainerDefinition(
  type: BlockType
): ContainerDefinition | undefined {
  return BLOCK_CONTAINER_CONFIG[type];
}

export function isContainerType(type: BlockType): boolean {
  return type in BLOCK_CONTAINER_CONFIG;
}

export function acceptsEmptyMergeFromAfter(type: BlockType): boolean {
  return BLOCK_CONTAINER_CONFIG[type]?.acceptEmptyMergeFromAfter ?? false;
}

export function defaultChildTypeForContainer(type: BlockType): BlockType {
  return BLOCK_CONTAINER_CONFIG[type]?.defaultChildType ?? "text";
}

export function canInsertSiblingInContainer(type: BlockType): boolean {
  return BLOCK_CONTAINER_CONFIG[type]?.insertSiblingOnEnter ?? false;
}

export function shouldLiftEmptyChildOnEnter(type: BlockType): boolean {
  return BLOCK_CONTAINER_CONFIG[type]?.onEmptyChildEnter === "lift-out";
}

export function shouldLiftChildOnEnterAtCaretStart(type: BlockType): boolean {
  return BLOCK_CONTAINER_CONFIG[type]?.onCaretStartChildEnter === "lift-out";
}

export function shouldLiftEmptyChildOnDelete(type: BlockType): boolean {
  return BLOCK_CONTAINER_CONFIG[type]?.onEmptyChildDelete === "lift-out";
}

export function shouldLiftDisallowedChildConversion(type: BlockType): boolean {
  return (
    BLOCK_CONTAINER_CONFIG[type]?.onDisallowedChildConversion === "lift-out"
  );
}

export function isAllowedChild(
  containerType: BlockType,
  childType: BlockType
): boolean {
  const def = BLOCK_CONTAINER_CONFIG[containerType];
  if (!def) {
    return false;
  }
  if (def.allowedChildTypes === "*") {
    return true;
  }
  return def.allowedChildTypes.includes(childType);
}
