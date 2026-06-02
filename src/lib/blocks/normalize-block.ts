import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import {
  defaultChildTypeForContainer,
  isAllowedChild,
  isContainerType,
} from "@/lib/canvas/block-container-config.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { blockSchema } from "@/lib/schemas/block.ts";

interface LegacyBulletListBlock {
  id: string;
  indent?: number;
  parentId?: string | null;
  props?: {
    children?: Array<{ text?: string }>;
  };
  type: "bulletList";
}

function migrateBulletList(raw: LegacyBulletListBlock): Block {
  const firstText = raw.props?.children?.[0]?.text ?? "";
  return {
    id: raw.id,
    type: "text",
    indent: raw.indent,
    parentId: raw.parentId ?? null,
    props: { text: firstText },
  };
}

/** Coerce persisted or legacy JSON into the current block model. */
export function normalizeBlock(raw: unknown): Block | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as { type?: string };
  if (candidate.type === "bulletList") {
    return migrateBulletList(raw as LegacyBulletListBlock);
  }

  const parsed = blockSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function coerceContainerChildBlock(
  block: Block,
  containerType: Block["type"]
): Block {
  const defaultChildType = defaultChildTypeForContainer(containerType);

  if (defaultChildType === "checklistItem") {
    return {
      id: block.id,
      type: "checklistItem",
      parentId: block.parentId ?? null,
      indent: block.indent,
      props: { text: getTextFromBlock(block), checked: false },
    };
  }

  if (defaultChildType !== "text") {
    return block;
  }

  return {
    id: block.id,
    type: "text",
    parentId: block.parentId ?? null,
    indent: block.indent,
    props: { text: getTextFromBlock(block) },
  };
}

/** Container children are validated against container policy when reading persisted blocks. */
export function coerceContainerChildBlocks(blocks: Block[]): Block[] {
  const containerTypesById = new Map(
    blocks
      .filter((block) => isContainerType(block.type))
      .map((block) => [block.id, block.type])
  );

  if (containerTypesById.size === 0) {
    return blocks;
  }

  return blocks.map((block) => {
    const parentId = block.parentId ?? null;
    const containerType = parentId
      ? containerTypesById.get(parentId)
      : undefined;
    if (!containerType || isAllowedChild(containerType, block.type)) {
      return block;
    }

    return coerceContainerChildBlock(block, containerType);
  });
}
