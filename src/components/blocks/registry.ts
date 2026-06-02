import {
  IconBlockquote,
  IconCheckbox,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconInfoCircle,
  IconLink,
  IconList,
  IconListNumbers,
  IconSeparator,
  IconTypography,
} from "@tabler/icons-react";
import { resolveRegisteredContainer } from "@/components/blocks/container-loaders.ts";
import { CalloutEdit } from "@/components/blocks/types/callout/callout-edit.tsx";
import { CalloutView } from "@/components/blocks/types/callout/callout-view.tsx";
import { ChecklistItemEdit } from "@/components/blocks/types/checklist/checklist-item-edit.tsx";
import { ChecklistItemView } from "@/components/blocks/types/checklist/checklist-item-view.tsx";
import { DividerEdit } from "@/components/blocks/types/divider/divider-edit.tsx";
import { DividerView } from "@/components/blocks/types/divider/divider-view.tsx";
import { HeadingEdit } from "@/components/blocks/types/heading/heading-edit.tsx";
import { HeadingView } from "@/components/blocks/types/heading/heading-view.tsx";
import { PageLinkEdit } from "@/components/blocks/types/page-link/page-link-edit.tsx";
import { PageLinkView } from "@/components/blocks/types/page-link/page-link-view.tsx";
import { QuoteEdit } from "@/components/blocks/types/quote/quote-edit.tsx";
import { QuoteView } from "@/components/blocks/types/quote/quote-view.tsx";
import { TextEdit } from "@/components/blocks/types/text/text-edit.tsx";
import { TextView } from "@/components/blocks/types/text/text-view.tsx";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { isBlockEmpty } from "@/lib/blocks/is-block-empty.ts";
import { BLOCK_CONTAINER_CONFIG } from "@/lib/canvas/block-container-config.ts";
import type {
  BlockFor,
  BlockSpec,
  SlashMenuItem,
} from "@/lib/canvas/block-spec.types.ts";
import { INLINE_TEXT_CAPABILITIES } from "@/lib/canvas/block-spec.types.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export const BLOCK_SPECS: { [K in BlockType]: BlockSpec<K> } = {
  heading: {
    type: "heading",
    label: "Heading",
    slashAliases: ["heading"],
    icon: IconH1,
    createDefault: () => createEmptyBlock("heading") as BlockFor<"heading">,
    behavior: {
      isEmpty: (b) => isBlockEmpty(b),
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    allowedParents: ["canvas"],
    View: HeadingView,
    Edit: HeadingEdit,
  },
  text: {
    type: "text",
    label: "Text",
    slashAliases: ["p", "text"],
    icon: IconTypography,
    createDefault: () => createEmptyBlock("text") as BlockFor<"text">,
    behavior: {
      isEmpty: (b) => isBlockEmpty(b),
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    allowedParents: ["canvas", "list"],
    View: TextView,
    Edit: TextEdit,
  },
  quote: {
    type: "quote",
    label: "Quote",
    slashAliases: ["quote", "blockquote"],
    icon: IconBlockquote,
    createDefault: () => createEmptyBlock("quote") as BlockFor<"quote">,
    behavior: {
      isEmpty: (b) => isBlockEmpty(b),
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    allowedParents: "canvas",
    View: QuoteView,
    Edit: QuoteEdit,
  },
  callout: {
    type: "callout",
    label: "Callout",
    slashAliases: ["callout"],
    icon: IconInfoCircle,
    createDefault: () => createEmptyBlock("callout") as BlockFor<"callout">,
    behavior: {
      isEmpty: (b) => isBlockEmpty(b),
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    allowedParents: "canvas",
    View: CalloutView,
    Edit: CalloutEdit,
  },
  checklistItem: {
    type: "checklistItem",
    label: "Checklist item",
    slashAliases: [],
    icon: IconCheckbox,
    createDefault: () =>
      createEmptyBlock("checklistItem") as BlockFor<"checklistItem">,
    behavior: {
      isEmpty: (b) => isBlockEmpty(b),
      editStrategy: "inline-text",
      capabilities: {
        ...INLINE_TEXT_CAPABILITIES,
        slashMenu: false,
      },
    },
    allowedParents: ["checklist"],
    View: ChecklistItemView,
    Edit: ChecklistItemEdit,
  },
  checklist: {
    type: "checklist",
    label: "Checklist",
    slashAliases: ["checklist", "todo", "task"],
    icon: IconCheckbox,
    createDefault: () => createEmptyBlock("checklist") as BlockFor<"checklist">,
    behavior: {
      isEmpty: () => true,
      editStrategy: "container",
      capabilities: {
        slashMenu: true,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: false,
        focusAdjacent: false,
      },
    },
    allowedParents: "canvas",
    Container: () => resolveRegisteredContainer("checklist"),
    container: BLOCK_CONTAINER_CONFIG.checklist ?? {
      allowedChildTypes: ["checklistItem"],
      defaultChildType: "checklistItem",
      onDisallowedChildConversion: "lift-out",
      onEmptyChildDelete: "lift-out",
      onEmptyChildEnter: "lift-out",
      onCaretStartChildEnter: "lift-out",
      insertSiblingOnEnter: true,
      acceptEmptyMergeFromAfter: true,
    },
  },
  pageLink: {
    type: "pageLink",
    label: "Page link",
    slashAliases: ["link", "page-link"],
    icon: IconLink,
    createDefault: () => createEmptyBlock("pageLink") as BlockFor<"pageLink">,
    behavior: {
      isEmpty: (b) => isBlockEmpty(b),
      editStrategy: "inline-custom",
      capabilities: {
        slashMenu: false,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: true,
        focusAdjacent: true,
      },
    },
    allowedParents: ["canvas"],
    View: PageLinkView,
    Edit: PageLinkEdit,
  },
  divider: {
    type: "divider",
    label: "Divider",
    slashAliases: ["divider", "hr", "line"],
    icon: IconSeparator,
    createDefault: () => createEmptyBlock("divider") as BlockFor<"divider">,
    behavior: {
      isEmpty: () => true,
      editStrategy: "inline-custom",
      capabilities: {
        slashMenu: true,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: true,
        focusAdjacent: true,
      },
    },
    allowedParents: "canvas",
    View: DividerView,
    Edit: DividerEdit,
  },
  list: {
    type: "list",
    label: "Bullet list",
    slashAliases: ["ul", "bullet", "list"],
    icon: IconList,
    createDefault: () => createEmptyBlock("list") as BlockFor<"list">,
    behavior: {
      isEmpty: () => true,
      editStrategy: "container",
      capabilities: {
        slashMenu: false,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: false,
        focusAdjacent: false,
      },
    },
    allowedParents: "canvas",
    Container: () => resolveRegisteredContainer("list"),
    container: BLOCK_CONTAINER_CONFIG.list ?? {
      allowedChildTypes: ["text"],
      defaultChildType: "text",
      onDisallowedChildConversion: "lift-out",
      onEmptyChildDelete: "lift-out",
      onEmptyChildEnter: "lift-out",
      onCaretStartChildEnter: "lift-out",
      insertSiblingOnEnter: true,
      acceptEmptyMergeFromAfter: true,
    },
  },
};

export function getBlockSpec<T extends BlockType>(type: T): BlockSpec<T> {
  return BLOCK_SPECS[type];
}

const HEADING_SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    key: "heading-1",
    id: "heading",
    headingLevel: 1,
    label: "Heading 1",
    aliases: ["h1", "heading1"],
    icon: IconH1,
    keywords: ["heading 1", "h1", "heading1", "heading"],
  },
  {
    key: "heading-2",
    id: "heading",
    headingLevel: 2,
    label: "Heading 2",
    aliases: ["h2", "heading2"],
    icon: IconH2,
    keywords: ["heading 2", "h2", "heading2", "heading"],
  },
  {
    key: "heading-3",
    id: "heading",
    headingLevel: 3,
    label: "Heading 3",
    aliases: ["h3", "heading3"],
    icon: IconH3,
    keywords: ["heading 3", "h3", "heading3", "heading"],
  },
  {
    key: "heading-4",
    id: "heading",
    headingLevel: 4,
    label: "Heading 4",
    aliases: ["h4", "heading4"],
    icon: IconH4,
    keywords: ["heading 4", "h4", "heading4", "heading"],
  },
];

const LIST_SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    key: "list-bullet",
    id: "list",
    listVariant: "bullet",
    label: "Bullet list",
    aliases: ["ul", "bullet", "list"],
    icon: IconList,
    keywords: ["bullet list", "ul", "bullet", "list"],
  },
  {
    key: "list-ordered",
    id: "list",
    listVariant: "ordered",
    label: "Numbered list",
    aliases: ["ol", "numbered", "ordered", "1."],
    icon: IconListNumbers,
    keywords: ["numbered list", "ol", "numbered", "ordered", "1."],
  },
];

function specToSlashMenuItems(spec: BlockSpec<BlockType>): SlashMenuItem[] {
  if (spec.type === "heading") {
    return HEADING_SLASH_MENU_ITEMS;
  }

  if (spec.type === "list") {
    return LIST_SLASH_MENU_ITEMS;
  }

  if (!spec.behavior.capabilities.slashMenu) {
    return [];
  }

  return [
    {
      key: spec.type,
      id: spec.type,
      label: spec.label,
      aliases: [...spec.slashAliases],
      icon: spec.icon,
      keywords: [spec.label, ...spec.slashAliases],
    },
  ];
}

export function getSlashMenuItems(): SlashMenuItem[] {
  return (Object.values(BLOCK_SPECS) as BlockSpec<BlockType>[]).flatMap(
    specToSlashMenuItems
  );
}

export function filterSlashMenuItems(query: string): SlashMenuItem[] {
  const normalized = query.trim().toLowerCase();
  const items = getSlashMenuItems();

  if (!normalized) {
    return items;
  }

  return items.filter((item) =>
    item.keywords.some((keyword) => keyword.toLowerCase().includes(normalized))
  );
}

export function createBlockFromType(type: BlockType): Block {
  return BLOCK_SPECS[type].createDefault();
}

export type {
  BlockContainerComponent,
  BlockContainerProps,
  BlockEditComponent,
  BlockEditProps,
  BlockEditPropsBase,
  BlockFor,
  BlockMode,
  BlockParent,
  BlockSpec,
  BlockViewComponent,
  BlockViewProps,
  ContainerBlockSpec,
  ContainerBlockType,
  ContainerDefinition,
  LeafBlockSpec,
  LeafBlockType,
  PropsFor,
  SlashMenuItem,
} from "@/lib/canvas/block-spec.types.ts";

export {
  isContainerSpec,
  isLeafSpec,
  resolveContainerComponent,
} from "@/lib/canvas/block-spec.types.ts";
