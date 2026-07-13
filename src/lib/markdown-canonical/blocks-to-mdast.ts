import type {
  BlockContent,
  Blockquote,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
  TableRow,
} from "mdast";
import type { ContainerDirective, LeafDirective } from "mdast-util-directive";

import { isContainerBlockType } from "@/lib/blocks/block-defs.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { getBlockParentId } from "@/lib/schemas/block.ts";
import type { InlineMark } from "@/lib/schemas/rich-text.ts";

import {
  type AttrValue,
  encodeAttrGroup,
  needsAttrSentinel,
} from "./attributes.ts";
import { marksToPhrasing } from "./inline-marks.ts";
import type { PageLinkContext } from "./page-link-context.ts";

/**
 * Block[] → mdast. The flat block array is grouped by `parentId` (order
 * preserved) and each scope renders to sibling nodes. Plain constructs emit
 * plain markdown; extension props ride in trailing `{…}` attribute groups or
 * directive attributes — only when non-default.
 *
 * @see docs/proposals/markdown-native-content.md
 */

const DEFAULT_TABLE_COLUMN_WIDTH = 120;

type Scope = Map<string | null, Block[]>;

interface SerializeState {
  ctx: PageLinkContext;
  scope: Scope;
}

function groupByParent(blocks: readonly Block[]): Scope {
  const ids = new Set(blocks.map((block) => block.id));
  const scope: Scope = new Map();
  for (const block of blocks) {
    const rawParent = getBlockParentId(block);
    const parentId =
      rawParent !== null && ids.has(rawParent) ? rawParent : null;
    const siblings = scope.get(parentId);
    if (siblings) {
      siblings.push(block);
    } else {
      scope.set(parentId, [block]);
    }
  }
  return scope;
}

function childrenOf(state: SerializeState, block: Block): Block[] {
  if (!isContainerBlockType(block.type)) {
    return [];
  }
  return state.scope.get(block.id) ?? [];
}

/** color/bg/indent — the base-schema fields every block may carry. */
function baseAttrs(block: Block): Record<string, AttrValue> {
  return {
    color: block.color,
    bg: block.backgroundColor,
    indent: block.indent && block.indent > 0 ? block.indent : undefined,
  };
}

function hasEncodedAttrs(attrs: Record<string, AttrValue>): boolean {
  return Object.values(attrs).some(
    (value) => value !== undefined && value !== false
  );
}

/**
 * Phrasing for primary text plus an optional trailing attribute group. Emits
 * the ` {}` sentinel when bare prose would otherwise mis-parse as a group.
 */
function richTextWithAttrs(
  text: string,
  marks: readonly InlineMark[] | undefined,
  attrs: Record<string, AttrValue>
): PhrasingContent[] {
  const phrasing = marksToPhrasing(text, marks);
  let group = "";
  if (hasEncodedAttrs(attrs)) {
    group = encodeAttrGroup(attrs);
  } else if (needsAttrSentinel(text)) {
    group = "{}";
  }
  if (group.length === 0) {
    return phrasing;
  }
  const suffix = text.length > 0 ? ` ${group}` : group;
  return [...phrasing, { type: "text", value: suffix }];
}

function paragraphOf(children: PhrasingContent[]): Paragraph {
  return { type: "paragraph", children };
}

/** A standalone `{…}` paragraph applying attrs to the preceding container. */
function attrTrailer(attrs: Record<string, AttrValue>): Paragraph | null {
  if (!hasEncodedAttrs(attrs)) {
    return null;
  }
  return paragraphOf([{ type: "text", value: encodeAttrGroup(attrs) }]);
}

type TextualBlock = Block & { props: { text: string; marks?: InlineMark[] } };

function textBlockNodes(block: TextualBlock): RootContent[] {
  const attrs = baseAttrs(block);
  if (block.props.text.length === 0 && !hasEncodedAttrs(attrs)) {
    // Blank rows are editor chrome; the canonical form drops them and
    // `normalizeEditablePageBlocks` restores the trailing blank on load.
    return [];
  }
  return [
    paragraphOf(richTextWithAttrs(block.props.text, block.props.marks, attrs)),
  ];
}

function headingNodes(
  block: Extract<Block, { type: "heading" | "toggleHeading" }>,
  state: SerializeState
): RootContent[] {
  const toggle = block.type === "toggleHeading";
  const attrs: Record<string, AttrValue> = {
    toggle,
    collapsed: toggle && block.props.collapsed === true,
    ...baseAttrs(block),
  };
  const heading: Heading = {
    type: "heading",
    depth: block.props.level,
    children: richTextWithAttrs(block.props.text, block.props.marks, attrs),
  };
  if (!toggle) {
    return [heading];
  }
  // Toggle children serialize as following siblings; the parser re-absorbs
  // them up to the next heading of equal-or-higher level.
  return [heading, ...renderScope(childrenOf(state, block), state)];
}

function quoteNodes(block: Extract<Block, { type: "quote" }>): RootContent[] {
  const blockquote: Blockquote = {
    type: "blockquote",
    children: [
      paragraphOf(
        richTextWithAttrs(block.props.text, block.props.marks, baseAttrs(block))
      ),
    ],
  };
  return [blockquote];
}

function calloutNodes(
  block: Extract<Block, { type: "callout" }>,
  state: SerializeState
): RootContent[] {
  const marker = `[!${block.props.icon ?? ""}]`;
  const group = encodeAttrGroup(baseAttrs(block));
  const markerText = group.length > 0 ? `${marker} ${group}` : marker;
  const body = renderScope(childrenOf(state, block), state).filter(
    (node): node is BlockContent => node.type !== "yaml"
  );
  const blockquote: Blockquote = {
    type: "blockquote",
    children: [paragraphOf([{ type: "text", value: markerText }]), ...body],
  };
  return [blockquote];
}

function codeNodes(block: Extract<Block, { type: "code" }>): RootContent[] {
  const nodes: RootContent[] = [
    {
      type: "code",
      lang: block.props.language ?? null,
      value: block.props.text,
    },
  ];
  const trailer = attrTrailer(baseAttrs(block));
  if (trailer) {
    nodes.push(trailer);
  }
  return nodes;
}

interface ListLevel {
  indent: number;
  list: List;
}

function listItemOf(child: Block, checklist: boolean): ListItem {
  const props = child.props as {
    checked?: boolean;
    marks?: InlineMark[];
    text?: string;
  };
  const paragraph = paragraphOf(
    richTextWithAttrs(props.text ?? "", props.marks, {
      color: child.color,
      bg: child.backgroundColor,
    })
  );
  return {
    type: "listItem",
    checked: checklist ? (props.checked ?? false) : null,
    spread: false,
    children: [paragraph],
  };
}

function listNodes(
  block: Extract<Block, { type: "list" | "checklist" }>,
  state: SerializeState
): RootContent[] {
  const checklist = block.type === "checklist";
  const ordered = !checklist && block.props.variant === "ordered";
  const root: List = {
    type: "list",
    ordered,
    start: ordered ? 1 : null,
    spread: false,
    children: [],
  };
  const stack: ListLevel[] = [{ indent: 0, list: root }];

  for (const child of childrenOf(state, block)) {
    const indent = Math.max(0, child.indent ?? 0);
    while (stack.length > 1 && indent < (stack.at(-1)?.indent ?? 0)) {
      stack.pop();
    }
    const top = stack.at(-1);
    if (!top) {
      break;
    }
    if (indent > top.indent) {
      const host = top.list.children.at(-1);
      const nested: List = {
        type: "list",
        ordered,
        start: ordered ? 1 : null,
        spread: false,
        children: [],
      };
      if (host) {
        host.children.push(nested);
        stack.push({ indent, list: nested });
      }
    }
    const target = stack.at(-1);
    target?.list.children.push(listItemOf(child, checklist));
  }

  const nodes: RootContent[] = [root];
  const trailer = attrTrailer(baseAttrs(block));
  if (trailer) {
    nodes.push(trailer);
  }
  return nodes;
}

function tableCellPhrasing(cell: Block): PhrasingContent[] {
  const props = cell.props as { marks?: InlineMark[]; text?: string };
  return marksToPhrasing(props.text ?? "", props.marks);
}

function tableNodes(
  block: Extract<Block, { type: "table" }>,
  state: SerializeState
): RootContent[] {
  const rowBlocks = childrenOf(state, block).filter(
    (child): child is Extract<Block, { type: "tableRow" }> =>
      child.type === "tableRow"
  );
  const rows: TableRow[] = rowBlocks.map((rowBlock) => ({
    type: "tableRow",
    children: childrenOf(state, rowBlock)
      .filter((cell) => cell.type === "tableCell")
      .map((cell) => ({
        type: "tableCell" as const,
        children: tableCellPhrasing(cell),
      })),
  }));
  const columnCount = Math.max(1, ...rows.map((row) => row.children.length));
  const table: Table = {
    type: "table",
    align: new Array<null>(columnCount).fill(null),
    children: rows,
  };

  const widths = block.props.columnWidths;
  const customWidths = widths.some(
    (width) => width !== DEFAULT_TABLE_COLUMN_WIDTH
  );
  const heights = rowBlocks.map((row) => row.props.height);
  const customHeights = heights.some((height) => height !== undefined);
  const trailer = attrTrailer({
    widths: customWidths ? widths.join(",") : undefined,
    "header-column": block.props.hasHeaderColumn,
    "no-header-row": !block.props.hasHeaderRow,
    "row-heights": customHeights
      ? heights
          .map((height) => (height === undefined ? "" : String(height)))
          .join(",")
      : undefined,
    ...baseAttrs(block),
  });
  return trailer ? [table, trailer] : [table];
}

function mediaNodes(block: Extract<Block, { type: "media" }>): RootContent[] {
  const url =
    block.props.source === "asset"
      ? `asset:${block.props.src}`
      : block.props.src;
  const children: PhrasingContent[] = [
    { type: "image", url, alt: block.props.alt ?? null },
  ];
  const group = encodeAttrGroup({
    video: block.props.kind === "video",
    width: block.props.widthPercent,
    mime: block.props.mimeType,
    file: block.props.fileName,
    ...baseAttrs(block),
  });
  if (group.length > 0) {
    children.push({ type: "text", value: ` ${group}` });
  }
  return [paragraphOf(children)];
}

function embedNodes(block: Extract<Block, { type: "embed" }>): RootContent[] {
  const children: PhrasingContent[] = [
    {
      type: "link",
      url: block.props.url,
      children: [{ type: "text", value: block.props.url }],
    },
  ];
  const group = encodeAttrGroup({
    title: block.props.title,
    description: block.props.description,
    image: block.props.imageUrl,
    caption: block.props.caption,
    "show-caption": block.props.showCaption === true,
    "hide-caption": block.props.showCaption === false,
    ...baseAttrs(block),
  });
  if (group.length > 0) {
    children.push({ type: "text", value: ` ${group}` });
  }
  return [paragraphOf(children)];
}

function pageLinkNodes(
  block: Extract<Block, { type: "pageLink" }>,
  state: SerializeState
): RootContent[] {
  const href =
    state.ctx.resolvePathByPageId?.(block.props.pageId) ??
    `page:${block.props.pageId}`;
  const label = state.ctx.resolveLabelByPageId?.(block.props.pageId) ?? href;
  const children: PhrasingContent[] = [
    { type: "link", url: href, children: [{ type: "text", value: label }] },
  ];
  const group = encodeAttrGroup(baseAttrs(block));
  if (group.length > 0) {
    children.push({ type: "text", value: ` ${group}` });
  }
  return [paragraphOf(children)];
}

function databaseNodes(
  block: Extract<Block, { type: "database" }>
): RootContent[] {
  const directive: LeafDirective = {
    type: "leafDirective",
    name: "database",
    attributes: {
      id: block.props.databaseId,
      ...(block.props.viewId === undefined ? {} : { view: block.props.viewId }),
      ...(block.props.hideTitle ? { "hide-title": "" } : {}),
    },
    children: [],
  };
  return [directive];
}

function directiveAttrValue(value: AttrValue): string | undefined {
  if (value === undefined || value === false) {
    return;
  }
  return value === true ? "" : String(value);
}

function containerDirective(
  name: string,
  attrs: Record<string, AttrValue>,
  children: RootContent[]
): ContainerDirective {
  const attributes: Record<string, string> = {};
  for (const [key, raw] of Object.entries(attrs)) {
    const value = directiveAttrValue(raw);
    if (value !== undefined) {
      attributes[key] = value;
    }
  }
  return {
    type: "containerDirective",
    name,
    attributes,
    children: children.filter(
      (node): node is BlockContent => node.type !== "yaml"
    ),
  };
}

function columnsNodes(
  block: Extract<Block, { type: "columns" }>,
  state: SerializeState
): RootContent[] {
  const columns = childrenOf(state, block).map((column) =>
    containerDirective(
      "column",
      {
        width: column.type === "column" ? column.props.width : undefined,
        ...baseAttrs(column),
      },
      renderScope(childrenOf(state, column), state)
    )
  );
  return [containerDirective("columns", baseAttrs(block), columns)];
}

function tabsNodes(
  block: Extract<Block, { type: "tabs" }>,
  state: SerializeState
): RootContent[] {
  const tabBlocks = childrenOf(state, block);
  const defaultIndex = tabBlocks.findIndex(
    (tab) => tab.id === block.props.defaultTabId
  );
  const tabs = tabBlocks.map((tab) =>
    containerDirective(
      "tab",
      {
        label: tab.type === "tab" ? tab.props.label : "",
        icon: tab.type === "tab" ? tab.props.icon : undefined,
        ...baseAttrs(tab),
      },
      renderScope(childrenOf(state, tab), state)
    )
  );
  return [
    containerDirective(
      "tabs",
      {
        default: defaultIndex >= 0 ? defaultIndex + 1 : undefined,
        size: block.props.size,
        variant: block.props.variant,
        ...baseAttrs(block),
      },
      tabs
    ),
  ];
}

function blockNodes(block: Block, state: SerializeState): RootContent[] {
  switch (block.type) {
    case "text":
      return textBlockNodes(block);
    case "heading":
    case "toggleHeading":
      return headingNodes(block, state);
    case "quote":
      return quoteNodes(block);
    case "callout":
      return calloutNodes(block, state);
    case "code":
      return codeNodes(block);
    case "divider":
      return [{ type: "thematicBreak" }];
    case "list":
    case "checklist":
      return listNodes(block, state);
    case "table":
      return tableNodes(block, state);
    case "media":
      return mediaNodes(block);
    case "embed":
      return embedNodes(block);
    case "pageLink":
      return pageLinkNodes(block, state);
    case "database":
      return databaseNodes(block);
    case "columns":
      return columnsNodes(block, state);
    case "tabs":
      return tabsNodes(block, state);
    default:
      // Structural children (column, tab, tableRow, tableCell, checklistItem)
      // are rendered by their containers; orphans at scope level are dropped.
      return [];
  }
}

function renderScope(
  blocks: readonly Block[],
  state: SerializeState
): RootContent[] {
  return blocks.flatMap((block) => blockNodes(block, state));
}

/** Serialize an ordered flat block array to mdast root children. */
export function blocksToMdastChildren(
  blocks: readonly Block[],
  ctx: PageLinkContext = {}
): RootContent[] {
  const state: SerializeState = { ctx, scope: groupByParent(blocks) };
  return renderScope(state.scope.get(null) ?? [], state);
}
