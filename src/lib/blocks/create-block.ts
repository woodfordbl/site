import {
  type BlockFor,
  type ContainerBlockType,
  getBlockDef,
} from "@/lib/blocks/block-defs.ts";
import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { defaultChildTypeForContainer } from "@/lib/canvas/block-container-config.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";
import type { PageLinkProps } from "@/lib/schemas/block-props.ts";

function createId(): string {
  return crypto.randomUUID();
}

/** Removes a leading `/command` when the slash menu was used at block start. */
export function stripSlashCommandText(text: string): string {
  return text.startsWith("/") ? "" : text;
}

export function createEmptyBlock<T extends BlockType>(type: T): BlockFor<T> {
  // Correlated-union construction TS cannot verify; BLOCK_DEFS guarantees the
  // props match the type.
  return {
    id: createId(),
    type,
    props: getBlockDef(type).defaultProps(),
  } as unknown as BlockFor<T>;
}

export function getTextFromBlock(block: Block): string {
  if (!getBlockDef(block.type).hasPrimaryText) {
    return "";
  }
  return (block.props as { text: string }).text;
}

export function withBlockText<T extends Block>(block: T, text: string): T {
  if (!getBlockDef(block.type).hasPrimaryText) {
    return block;
  }
  return { ...block, props: { ...block.props, text } };
}

/**
 * Replaces block type and props; keeps id.
 * `pageLink` conversions require `pageId`; pass `pageLinkVariant` from slash **New Page** / **Link To Page**.
 */
export function convertBlockType(
  block: Block,
  type: BlockType,
  options?: {
    indent?: number;
    pageId?: string;
    pageLinkVariant?: PageLinkProps["variant"];
    text?: string;
    headingLevel?: 1 | 2 | 3 | 4;
  }
): Block {
  const indent = options?.indent ?? getBlockIndent(block);
  const parentId = block.parentId ?? null;

  if (type === "pageLink") {
    if (!options?.pageId) {
      throw new Error("pageLink conversion requires pageId");
    }

    return {
      ...createEmptyBlock("pageLink"),
      id: block.id,
      parentId,
      indent,
      props: {
        pageId: options.pageId,
        ...(options.pageLinkVariant
          ? { variant: options.pageLinkVariant }
          : {}),
      },
    };
  }

  if (type === "heading" || type === "toggleHeading") {
    const next = createEmptyBlock(type);
    const sourceLevel =
      block.type === "heading" || block.type === "toggleHeading"
        ? block.props.level
        : 1;
    return {
      ...next,
      id: block.id,
      parentId,
      indent,
      props: {
        ...next.props,
        text: options?.text ?? getTextFromBlock(block),
        level: options?.headingLevel ?? sourceLevel,
      },
    };
  }

  const next: Block = {
    ...createEmptyBlock(type),
    id: block.id,
    parentId,
    indent,
  };
  const text = options?.text ?? getTextFromBlock(block);
  return text ? withBlockText(next, text) : next;
}

export function createPageLinkBlock(pageId: string): BlockFor<"pageLink"> {
  return {
    ...createEmptyBlock("pageLink"),
    props: { pageId },
  };
}

export function buildWrappedContainerBlock(
  containerType: ContainerBlockType,
  id: string,
  options: {
    indent: number;
    parentId: string | null;
    variant?: "bullet" | "ordered";
  }
): Block {
  const container: Block = {
    ...createEmptyBlock(containerType),
    id,
    indent: options.indent,
    parentId: options.parentId,
  };

  if (container.type === "list") {
    return {
      ...container,
      props: { variant: options.variant ?? "bullet" },
    };
  }

  return container;
}

export function buildContainerChildBlock(
  containerType: ContainerBlockType,
  parentId: string,
  options?: { text?: string }
): Block {
  const childType = defaultChildTypeForContainer(containerType);
  const child: Block = {
    ...createEmptyBlock(childType),
    parentId,
  };
  return options?.text ? withBlockText(child, options.text) : child;
}
