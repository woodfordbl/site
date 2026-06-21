import {
  IconBlockquote,
  IconCheckbox,
  IconH1,
  IconH2,
  IconH3,
  IconH4,
  IconInfoCircle,
  IconLayoutColumns,
  IconLink,
  IconList,
  IconListNumbers,
  IconPhoto,
  IconSeparator,
  IconTable,
  IconTypography,
  IconWorld,
} from "@tabler/icons-react";
import { resolveRegisteredContainer } from "@/components/blocks/container-loaders.ts";
import { CalloutEdit } from "@/components/blocks/types/callout/callout-edit.tsx";
import { CalloutView } from "@/components/blocks/types/callout/callout-view.tsx";
import { ChecklistItemEdit } from "@/components/blocks/types/checklist/checklist-item-edit.tsx";
import { ChecklistItemView } from "@/components/blocks/types/checklist/checklist-item-view.tsx";
import { DividerEdit } from "@/components/blocks/types/divider/divider-edit.tsx";
import { DividerView } from "@/components/blocks/types/divider/divider-view.tsx";
import { EmbedEdit } from "@/components/blocks/types/embed/embed-edit.tsx";
import { EmbedView } from "@/components/blocks/types/embed/embed-view.tsx";
import { HeadingEdit } from "@/components/blocks/types/heading/heading-edit.tsx";
import { HeadingView } from "@/components/blocks/types/heading/heading-view.tsx";
import { MediaEdit } from "@/components/blocks/types/media/media-edit.tsx";
import { MediaView } from "@/components/blocks/types/media/media-view.tsx";
import { PageLinkEdit } from "@/components/blocks/types/page-link/page-link-edit.tsx";
import { PageLinkView } from "@/components/blocks/types/page-link/page-link-view.tsx";
import { QuoteEdit } from "@/components/blocks/types/quote/quote-edit.tsx";
import { QuoteView } from "@/components/blocks/types/quote/quote-view.tsx";
import { TableCellEdit } from "@/components/blocks/types/table/table-cell-edit.tsx";
import { TableCellView } from "@/components/blocks/types/table/table-cell-view.tsx";
import { TextEdit } from "@/components/blocks/types/text/text-edit.tsx";
import { TextView } from "@/components/blocks/types/text/text-view.tsx";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { BLOCK_CONTAINER_CONFIG } from "@/lib/canvas/block-container-config.ts";
import type {
  BlockSpec,
  SlashMenuItem,
} from "@/lib/canvas/block-spec.types.ts";
import { INLINE_TEXT_CAPABILITIES } from "@/lib/canvas/block-spec.types.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

const INLINE_CUSTOM_CAPABILITIES = {
  slashMenu: true,
  rowSplit: false,
  blockIndent: false,
  structuralKeys: true,
  focusAdjacent: true,
} as const;

const CONTAINER_CAPABILITIES = {
  slashMenu: false,
  rowSplit: false,
  blockIndent: false,
  structuralKeys: false,
  focusAdjacent: false,
} as const;

export const BLOCK_SPECS: { [K in BlockType]: BlockSpec<K> } = {
  heading: {
    type: "heading",
    label: "Heading",
    slashAliases: ["heading"],
    icon: IconH1,
    createDefault: () => createEmptyBlock("heading"),
    behavior: {
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    slashItems: [
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
    ],
    View: HeadingView,
    Edit: HeadingEdit,
  },
  text: {
    type: "text",
    label: "Text",
    slashAliases: ["p", "text"],
    icon: IconTypography,
    createDefault: () => createEmptyBlock("text"),
    behavior: {
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    View: TextView,
    Edit: TextEdit,
  },
  quote: {
    type: "quote",
    label: "Quote",
    slashAliases: ["quote", "blockquote"],
    icon: IconBlockquote,
    createDefault: () => createEmptyBlock("quote"),
    behavior: {
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    View: QuoteView,
    Edit: QuoteEdit,
  },
  callout: {
    type: "callout",
    label: "Callout",
    slashAliases: ["callout"],
    icon: IconInfoCircle,
    createDefault: () => createEmptyBlock("callout"),
    behavior: {
      editStrategy: "inline-text",
      capabilities: INLINE_TEXT_CAPABILITIES,
    },
    View: CalloutView,
    Edit: CalloutEdit,
  },
  checklistItem: {
    type: "checklistItem",
    label: "Checklist item",
    slashAliases: [],
    icon: IconCheckbox,
    createDefault: () => createEmptyBlock("checklistItem"),
    behavior: {
      editStrategy: "inline-text",
      capabilities: {
        ...INLINE_TEXT_CAPABILITIES,
        slashMenu: false,
      },
    },
    View: ChecklistItemView,
    Edit: ChecklistItemEdit,
  },
  checklist: {
    type: "checklist",
    label: "Checklist",
    slashAliases: ["checklist", "todo", "task"],
    icon: IconCheckbox,
    createDefault: () => createEmptyBlock("checklist"),
    behavior: {
      editStrategy: "container",
      capabilities: { ...CONTAINER_CAPABILITIES, slashMenu: true },
    },
    Container: () => resolveRegisteredContainer("checklist"),
    container: BLOCK_CONTAINER_CONFIG.checklist,
  },
  pageLink: {
    type: "pageLink",
    label: "Page link",
    slashAliases: ["link", "page-link"],
    icon: IconLink,
    createDefault: () => createEmptyBlock("pageLink"),
    behavior: {
      editStrategy: "inline-custom",
      capabilities: {
        slashMenu: false,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: true,
        focusAdjacent: true,
      },
    },
    View: PageLinkView,
    Edit: PageLinkEdit,
  },
  divider: {
    type: "divider",
    label: "Divider",
    slashAliases: ["divider", "hr", "line"],
    icon: IconSeparator,
    createDefault: () => createEmptyBlock("divider"),
    behavior: {
      editStrategy: "inline-custom",
      capabilities: {
        slashMenu: true,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: true,
        focusAdjacent: true,
      },
    },
    View: DividerView,
    Edit: DividerEdit,
  },
  media: {
    type: "media",
    label: "Media",
    slashAliases: ["image", "video", "gif", "media", "photo"],
    icon: IconPhoto,
    createDefault: () => createEmptyBlock("media"),
    behavior: {
      editStrategy: "inline-custom",
      capabilities: INLINE_CUSTOM_CAPABILITIES,
    },
    View: MediaView,
    Edit: MediaEdit,
  },
  embed: {
    type: "embed",
    label: "Embed",
    slashAliases: ["embed", "bookmark", "url", "link"],
    icon: IconWorld,
    createDefault: () => createEmptyBlock("embed"),
    behavior: {
      editStrategy: "inline-custom",
      capabilities: INLINE_CUSTOM_CAPABILITIES,
    },
    View: EmbedView,
    Edit: EmbedEdit,
  },
  column: {
    type: "column",
    label: "Column",
    slashAliases: [],
    icon: IconLayoutColumns,
    createDefault: () => createEmptyBlock("column"),
    behavior: {
      editStrategy: "container",
      capabilities: CONTAINER_CAPABILITIES,
    },
    Container: () => resolveRegisteredContainer("column"),
    container: BLOCK_CONTAINER_CONFIG.column,
  },
  columns: {
    type: "columns",
    label: "Columns",
    slashAliases: ["columns", "cols", "column"],
    icon: IconLayoutColumns,
    createDefault: () => createEmptyBlock("columns"),
    behavior: {
      editStrategy: "container",
      capabilities: { ...CONTAINER_CAPABILITIES, slashMenu: true },
    },
    slashItems: [
      {
        key: "columns-2",
        id: "columns",
        columnCount: 2,
        label: "2 columns",
        aliases: ["2", "two", "cols2"],
        icon: IconLayoutColumns,
        keywords: ["2 columns", "two columns", "columns", "cols"],
      },
      {
        key: "columns-3",
        id: "columns",
        columnCount: 3,
        label: "3 columns",
        aliases: ["3", "three", "cols3"],
        icon: IconLayoutColumns,
        keywords: ["3 columns", "three columns", "columns", "cols"],
      },
      {
        key: "columns-4",
        id: "columns",
        columnCount: 4,
        label: "4 columns",
        aliases: ["4", "four", "cols4"],
        icon: IconLayoutColumns,
        keywords: ["4 columns", "four columns", "columns", "cols"],
      },
    ],
    Container: () => resolveRegisteredContainer("columns"),
    container: BLOCK_CONTAINER_CONFIG.columns,
  },
  list: {
    type: "list",
    label: "Bullet list",
    slashAliases: ["ul", "bullet", "list"],
    icon: IconList,
    createDefault: () => createEmptyBlock("list"),
    behavior: {
      editStrategy: "container",
      capabilities: CONTAINER_CAPABILITIES,
    },
    slashItems: [
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
    ],
    Container: () => resolveRegisteredContainer("list"),
    container: BLOCK_CONTAINER_CONFIG.list,
  },
  table: {
    type: "table",
    label: "Table",
    slashAliases: ["table", "grid"],
    icon: IconTable,
    createDefault: () => createEmptyBlock("table"),
    behavior: {
      editStrategy: "container",
      capabilities: { ...CONTAINER_CAPABILITIES, slashMenu: true },
    },
    Container: () => resolveRegisteredContainer("table"),
    container: BLOCK_CONTAINER_CONFIG.table,
  },
  tableRow: {
    type: "tableRow",
    label: "Table row",
    slashAliases: [],
    icon: IconTable,
    createDefault: () => createEmptyBlock("tableRow"),
    behavior: {
      editStrategy: "container",
      capabilities: CONTAINER_CAPABILITIES,
    },
    Container: () => resolveRegisteredContainer("tableRow"),
    container: BLOCK_CONTAINER_CONFIG.tableRow,
  },
  tableCell: {
    type: "tableCell",
    label: "Table cell",
    slashAliases: [],
    icon: IconTable,
    createDefault: () => createEmptyBlock("tableCell"),
    behavior: {
      editStrategy: "inline-text",
      capabilities: {
        slashMenu: false,
        rowSplit: false,
        blockIndent: false,
        structuralKeys: false,
        focusAdjacent: false,
      },
    },
    View: TableCellView,
    Edit: TableCellEdit,
  },
};

export function getBlockSpec<T extends BlockType>(type: T): BlockSpec<T> {
  return BLOCK_SPECS[type];
}

function specToSlashMenuItems(spec: BlockSpec<BlockType>): SlashMenuItem[] {
  if (spec.slashItems) {
    return spec.slashItems;
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

const SLASH_MENU_ITEMS: SlashMenuItem[] = (
  Object.values(BLOCK_SPECS) as BlockSpec<BlockType>[]
).flatMap(specToSlashMenuItems);

export function getSlashMenuItems(): SlashMenuItem[] {
  return SLASH_MENU_ITEMS;
}

export function filterSlashMenuItems(query: string): SlashMenuItem[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return SLASH_MENU_ITEMS;
  }

  return SLASH_MENU_ITEMS.filter(
    (item) =>
      item.keywords.some((keyword) =>
        keyword.toLowerCase().includes(normalized)
      ) ||
      item.aliases.some((alias) => alias.toLowerCase().includes(normalized)) ||
      item.label.toLowerCase().includes(normalized)
  );
}

export function createBlockFromType(type: BlockType): Block {
  return BLOCK_SPECS[type].createDefault();
}

export type {
  BlockFor,
  ContainerBlockType,
  LeafBlockType,
  PropsFor,
} from "@/lib/blocks/block-defs.ts";

export type {
  BlockContainerComponent,
  BlockContainerProps,
  BlockEditComponent,
  BlockEditProps,
  BlockEditPropsBase,
  BlockMode,
  BlockSpec,
  BlockViewComponent,
  BlockViewProps,
  ContainerBlockSpec,
  ContainerDefinition,
  LeafBlockSpec,
  SlashMenuItem,
} from "@/lib/canvas/block-spec.types.ts";

export {
  isContainerSpec,
  isLeafSpec,
  resolveContainerComponent,
} from "@/lib/canvas/block-spec.types.ts";
