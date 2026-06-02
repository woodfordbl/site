import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { defaultChildTypeForContainer } from "@/lib/canvas/block-container-config.ts";
import type { ContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";
import type {
  CalloutProps,
  ChecklistItemProps,
  HeadingProps,
  ListProps,
  PageLinkProps,
  QuoteProps,
  TextProps,
} from "@/lib/schemas/block-props.ts";

function createId(): string {
  return crypto.randomUUID();
}

const defaultPropsByType = {
  heading: { level: 1, text: "" } satisfies HeadingProps,
  text: { text: "" } satisfies TextProps,
  list: { variant: "bullet" as const } satisfies ListProps,
  quote: { text: "" } satisfies QuoteProps,
  callout: { text: "" } satisfies CalloutProps,
  checklist: {} satisfies Record<string, never>,
  checklistItem: { text: "", checked: false } satisfies ChecklistItemProps,
  pageLink: { pageId: "" } satisfies PageLinkProps,
  divider: {} satisfies Record<string, never>,
} as const;

/** Removes a leading `/command` when the slash menu was used at block start. */
export function stripSlashCommandText(text: string): string {
  return text.startsWith("/") ? "" : text;
}

export function getTextFromBlock(block: Block): string {
  switch (block.type) {
    case "heading":
    case "text":
    case "quote":
    case "callout":
    case "checklistItem":
      return block.props.text;
    case "list":
    case "checklist":
    case "pageLink":
    case "divider":
      return "";
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

/** Replaces block type and props; keeps id. */
export function convertBlockType(
  block: Block,
  type: BlockType,
  options?: {
    indent?: number;
    pageId?: string;
    text?: string;
    headingLevel?: 1 | 2 | 3 | 4;
  }
): Block {
  const next = createEmptyBlock(type);
  const indent = options?.indent ?? getBlockIndent(block);
  const parentId = block.parentId ?? null;

  if (type === "pageLink") {
    if (!options?.pageId) {
      throw new Error("pageLink conversion requires pageId");
    }

    return {
      ...(next as Extract<Block, { type: "pageLink" }>),
      id: block.id,
      parentId,
      indent,
      props: { pageId: options.pageId },
    };
  }

  if (
    type === "text" ||
    type === "heading" ||
    type === "quote" ||
    type === "callout"
  ) {
    const text = options?.text ?? getTextFromBlock(block);
    const converted = next as Extract<
      Block,
      { type: "text" | "heading" | "quote" | "callout" }
    >;
    const props =
      type === "heading"
        ? {
            ...converted.props,
            text,
            level:
              options?.headingLevel ??
              (block.type === "heading" ? block.props.level : 1),
          }
        : { ...converted.props, text };
    return {
      ...converted,
      id: block.id,
      parentId,
      indent,
      props,
    } as Block;
  }

  if (type === "checklistItem") {
    const text = options?.text ?? getTextFromBlock(block);
    return {
      ...(next as Extract<Block, { type: "checklistItem" }>),
      id: block.id,
      parentId,
      indent,
      props: { text, checked: false },
    };
  }

  return { ...next, id: block.id, parentId, indent };
}

export function createEmptyBlock(type: BlockType): Block {
  const id = createId();

  switch (type) {
    case "heading":
      return { id, type, props: { ...defaultPropsByType.heading } };
    case "text":
      return { id, type, props: { ...defaultPropsByType.text } };
    case "list":
      return { id, type, props: { ...defaultPropsByType.list } };
    case "quote":
      return { id, type, props: { ...defaultPropsByType.quote } };
    case "callout":
      return { id, type, props: { ...defaultPropsByType.callout } };
    case "checklist":
      return { id, type, props: { ...defaultPropsByType.checklist } };
    case "checklistItem":
      return { id, type, props: { ...defaultPropsByType.checklistItem } };
    case "pageLink":
      return { id, type, props: { ...defaultPropsByType.pageLink } };
    case "divider":
      return { id, type, props: { ...defaultPropsByType.divider } };
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function withBlockText(block: Block, text: string): Block {
  switch (block.type) {
    case "heading":
      return { ...block, props: { ...block.props, text } };
    case "text":
      return { ...block, props: { ...block.props, text } };
    case "quote":
      return { ...block, props: { ...block.props, text } };
    case "callout":
      return { ...block, props: { ...block.props, text } };
    case "checklistItem":
      return { ...block, props: { ...block.props, text } };
    case "list":
    case "checklist":
    case "pageLink":
    case "divider":
      return block;
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function createPageLinkBlock(
  pageId: string
): Extract<Block, { type: "pageLink" }> {
  return {
    ...createEmptyBlock("pageLink"),
    props: { pageId },
  } as Extract<Block, { type: "pageLink" }>;
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
  const container = createEmptyBlock(containerType);

  if (containerType === "list") {
    return {
      ...(container as Extract<Block, { type: "list" }>),
      id,
      indent: options.indent,
      parentId: options.parentId,
      props: { variant: options.variant ?? "bullet" },
    };
  }

  return {
    ...(container as Extract<Block, { type: "checklist" }>),
    id,
    indent: options.indent,
    parentId: options.parentId,
    props: {},
  };
}

export function buildContainerChildBlock(
  containerType: ContainerBlockType,
  parentId: string,
  options?: { text?: string }
): Block {
  const childType = defaultChildTypeForContainer(containerType);
  const text = options?.text ?? "";

  if (childType === "checklistItem") {
    return {
      id: crypto.randomUUID(),
      type: "checklistItem",
      parentId,
      props: { text, checked: false },
    };
  }

  return {
    id: crypto.randomUUID(),
    type: "text",
    parentId,
    props: { text },
  };
}
