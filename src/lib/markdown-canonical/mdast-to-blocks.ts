import type {
  Blockquote,
  Code,
  Heading,
  Html,
  Image,
  Link,
  List,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
} from "mdast";
import type { ContainerDirective, LeafDirective } from "mdast-util-directive";

import { normalizeInlineMarks } from "@/lib/blocks/rich-text.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";
import type { BlockColor, InlineMark } from "@/lib/schemas/rich-text.ts";
import { blockColorSchema } from "@/lib/schemas/rich-text.ts";

import {
  isAttrGroupOnly,
  type ParsedAttrs,
  splitTrailingAttrGroup,
} from "./attributes.ts";
import { mintBlockId } from "./block-ids.ts";
import { phrasingToMarks } from "./inline-marks.ts";
import type { PageLinkContext } from "./page-link-context.ts";

/**
 * mdast → flat Block[] with `parentId`/`indent` and deterministic ids.
 * The inverse of `blocks-to-mdast.ts`; ambiguity rules (link-only paragraph =
 * pageLink, autolink-only = embed, `[!…]` blockquote = callout, `{toggle}`
 * heading absorbs its section) are the load-bearing contract and are covered
 * by the codec test suite.
 */

const DEFAULT_TABLE_COLUMN_WIDTH = 120;
const CALLOUT_MARKER_RE = /^\[!([^\]\n]*)\]\s*/;
const PAGE_URI_PREFIX = "page:";
const HTTP_RE = /^https?:\/\//i;
const MAX_INDENT = 4;

interface ParseState {
  ctx: PageLinkContext;
  pageId: string;
}

interface ScopeCursor {
  parentId: string | null;
  path: readonly number[];
}

interface RichText {
  marks: InlineMark[];
  text: string;
}

function mint(state: ParseState, path: readonly number[]): string {
  return mintBlockId(state.pageId, path);
}

function withParent(parentId: string | null): { parentId?: string | null } {
  return parentId === null ? {} : { parentId };
}

function parseColor(value: string | true | undefined) {
  if (typeof value !== "string") {
    return;
  }
  const parsed = blockColorSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseIndent(value: string | true | undefined): number | undefined {
  if (typeof value !== "string") {
    return;
  }
  const indent = Number.parseInt(value, 10);
  if (Number.isNaN(indent) || indent <= 0) {
    return;
  }
  return Math.min(indent, MAX_INDENT);
}

function parseNumber(value: string | true | undefined): number | undefined {
  if (typeof value !== "string") {
    return;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface BlockBaseFields {
  backgroundColor?: BlockColor;
  color?: BlockColor;
  indent?: number;
}

/** color/bg/indent from a parsed attr group, as block-base fields. */
function baseFields(attrs: ParsedAttrs): BlockBaseFields {
  const color = parseColor(attrs.color);
  const backgroundColor = parseColor(attrs.bg);
  const indent = parseIndent(attrs.indent);
  return {
    ...(color === undefined ? {} : { color }),
    ...(backgroundColor === undefined ? {} : { backgroundColor }),
    ...(indent === undefined ? {} : { indent }),
  };
}

/** Assemble phrasing, then strip one trailing attr group off the plain text. */
function richTextWithAttrs(nodes: readonly PhrasingContent[]): {
  attrs: ParsedAttrs;
  rich: RichText;
} {
  const assembled = phrasingToMarks(nodes);
  const { attrs, text } = splitTrailingAttrGroup(assembled.text);
  if (text === assembled.text) {
    return { attrs, rich: assembled };
  }
  return {
    attrs,
    rich: {
      text,
      marks: normalizeInlineMarks(assembled.marks, text.length),
    },
  };
}

function marksProp(marks: InlineMark[]): { marks?: InlineMark[] } {
  return marks.length > 0 ? { marks } : {};
}

type HeadingLevel = 1 | 2 | 3 | 4;

function headingLevel(depth: number): HeadingLevel {
  return Math.min(Math.max(depth, 1), 4) as HeadingLevel;
}

function isAttrTrailerParagraph(
  node: RootContent | undefined
): node is Paragraph {
  if (node?.type !== "paragraph") {
    return false;
  }
  // Text nodes only: an image/link followed by its own ` {…}` suffix must
  // never be eaten as the previous container's trailer.
  if (!node.children.every((child) => child.type === "text")) {
    return false;
  }
  return isAttrGroupOnly(phrasingToMarks(node.children).text);
}

/** Blocks that accept a standalone `{…}` trailer paragraph after them. */
const TRAILER_TYPES = new Set<BlockType>([
  "list",
  "checklist",
  "table",
  "code",
]);

export function mdastToBlocks(
  nodes: readonly RootContent[],
  state: ParseState
): Block[] {
  return parseScope(nodes, { parentId: null, path: [] }, state);
}

function parseScope(
  nodes: readonly RootContent[],
  cursor: ScopeCursor,
  state: ParseState
): Block[] {
  const blocks: Block[] = [];
  let position = 0;
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];
    if (node === undefined || node.type === "yaml") {
      index += 1;
      continue;
    }

    const path = [...cursor.path, position];
    const produced =
      node.type === "heading"
        ? parseHeadingSection(nodes, index, cursor, path, state)
        : { blocks: parseNode(node, cursor, path, state), next: index + 1 };

    let next = produced.next;
    const first = produced.blocks[0];
    if (first && TRAILER_TYPES.has(first.type)) {
      const trailer = nodes[next];
      if (isAttrTrailerParagraph(trailer)) {
        const { attrs } = richTextWithAttrs(trailer.children);
        applyTrailerAttrs(first, attrs, produced.blocks);
        next += 1;
      }
    }

    if (produced.blocks.length > 0) {
      blocks.push(...produced.blocks);
      position += 1;
    }
    index = next;
  }
  return blocks;
}

interface ParsedSection {
  blocks: Block[];
  next: number;
}

/** Heading, or `{toggle}` heading absorbing its section as children. */
function parseHeadingSection(
  nodes: readonly RootContent[],
  index: number,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): ParsedSection {
  const node = nodes[index] as Heading;
  const { attrs, rich } = richTextWithAttrs(node.children);
  const level = headingLevel(node.depth);
  const id = mint(state, path);

  if (attrs.toggle !== true) {
    const heading: Block = {
      id,
      ...withParent(cursor.parentId),
      type: "heading",
      props: { level, text: rich.text, ...marksProp(rich.marks) },
      ...baseFields(attrs),
    };
    return { blocks: [heading], next: index + 1 };
  }

  let end = index + 1;
  while (end < nodes.length) {
    const sibling = nodes[end];
    if (sibling?.type === "heading" && headingLevel(sibling.depth) <= level) {
      break;
    }
    end += 1;
  }
  const toggle: Block = {
    id,
    ...withParent(cursor.parentId),
    type: "toggleHeading",
    props: {
      level,
      text: rich.text,
      ...marksProp(rich.marks),
      ...(attrs.collapsed === true ? { collapsed: true } : {}),
    },
    ...baseFields(attrs),
  };
  const children = parseScope(
    nodes.slice(index + 1, end),
    { parentId: id, path },
    state
  );
  return { blocks: [toggle, ...children], next: end };
}

function parseNode(
  node: RootContent,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  switch (node.type) {
    case "paragraph":
      return parseParagraph(node, cursor, path, state);
    case "blockquote":
      return parseBlockquote(node, cursor, path, state);
    case "code":
      return [parseCode(node, cursor, path, state)];
    case "thematicBreak":
      return [
        {
          id: mint(state, path),
          ...withParent(cursor.parentId),
          type: "divider",
          props: {},
        },
      ];
    case "list":
      return parseList(node, cursor, path, state);
    case "table":
      return parseTable(node, cursor, path, state);
    case "containerDirective":
      return parseContainerDirective(node, cursor, path, state);
    case "leafDirective":
      return parseLeafDirective(node, cursor, path, state);
    case "html":
      return parseHtmlBlock(node, cursor, path, state);
    default:
      return parseFallback(node, cursor, path, state);
  }
}

interface ExtractedInline {
  attrs: ParsedAttrs;
  node: Image | Link;
}

/**
 * `[image]` / `[link]` optionally followed by one ` {…}` attr group. The
 * group is validated on the REMAINDER's assembled plain text — GFM autolink
 * literals split bare URLs inside attr values into extra link nodes.
 */
function extractSoleInline(paragraph: Paragraph): ExtractedInline | null {
  const children = paragraph.children;
  const first = children[0];
  if (!first || (first.type !== "image" && first.type !== "link")) {
    return null;
  }
  if (children.length === 1) {
    return { attrs: {}, node: first };
  }
  const rest = phrasingToMarks(children.slice(1)).text;
  if (isAttrGroupOnly(rest)) {
    const { attrs } = splitTrailingAttrGroup(rest.trim());
    return { attrs, node: first };
  }
  return null;
}

function parseParagraph(
  node: Paragraph,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const sole = extractSoleInline(node);
  if (sole?.node.type === "image") {
    return [parseMedia(sole.node, sole.attrs, cursor, path, state)];
  }
  if (sole?.node.type === "link") {
    const linkBlock = parseLinkParagraph(
      sole.node,
      sole.attrs,
      cursor,
      path,
      state
    );
    if (linkBlock) {
      return [linkBlock];
    }
  }

  const { attrs, rich } = richTextWithAttrs(node.children);
  if (rich.text.length === 0 && Object.keys(attrs).length === 0) {
    return [];
  }
  return [
    {
      id: mint(state, path),
      ...withParent(cursor.parentId),
      type: "text",
      props: { text: rich.text, ...marksProp(rich.marks) },
      ...baseFields(attrs),
    },
  ];
}

function parseMedia(
  image: Image,
  attrs: ParsedAttrs,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block {
  const isAsset = image.url.startsWith("asset:");
  const width = parseNumber(attrs.width);
  const widthPercent =
    width === undefined ? undefined : Math.min(Math.max(width, 25), 100);
  return {
    id: mint(state, path),
    ...withParent(cursor.parentId),
    type: "media",
    props: {
      kind: attrs.video === true ? "video" : "image",
      source: isAsset ? "asset" : "url",
      src: isAsset ? image.url.slice("asset:".length) : image.url,
      ...(typeof attrs.mime === "string" ? { mimeType: attrs.mime } : {}),
      ...(typeof attrs.file === "string" ? { fileName: attrs.file } : {}),
      ...(image.alt ? { alt: image.alt } : {}),
      ...(widthPercent === undefined ? {} : { widthPercent }),
    },
    ...baseFields(attrs),
  };
}

function parseLinkParagraph(
  link: Link,
  attrs: ParsedAttrs,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block | null {
  const label = phrasingToMarks(link.children).text;

  if (link.url.startsWith(PAGE_URI_PREFIX)) {
    return pageLinkBlock(
      link.url.slice(PAGE_URI_PREFIX.length),
      attrs,
      cursor,
      path,
      state
    );
  }
  if (!HTTP_RE.test(link.url)) {
    const resolved = state.ctx.resolvePageIdByPath?.(link.url);
    if (resolved !== undefined) {
      return pageLinkBlock(resolved, attrs, cursor, path, state);
    }
    return null;
  }
  if (label !== link.url) {
    return null;
  }
  return {
    id: mint(state, path),
    ...withParent(cursor.parentId),
    type: "embed",
    props: {
      url: link.url,
      ...(typeof attrs.title === "string" ? { title: attrs.title } : {}),
      ...(typeof attrs.description === "string"
        ? { description: attrs.description }
        : {}),
      ...(typeof attrs.image === "string" ? { imageUrl: attrs.image } : {}),
      ...(typeof attrs.caption === "string" ? { caption: attrs.caption } : {}),
      ...(attrs["show-caption"] === true ? { showCaption: true } : {}),
      ...(attrs["hide-caption"] === true ? { showCaption: false } : {}),
    },
    ...baseFields(attrs),
  };
}

function pageLinkBlock(
  pageId: string,
  attrs: ParsedAttrs,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block {
  return {
    id: mint(state, path),
    ...withParent(cursor.parentId),
    type: "pageLink",
    props: { pageId },
    ...baseFields(attrs),
  };
}

function parseBlockquote(
  node: Blockquote,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const first = node.children[0];
  const firstText =
    first?.type === "paragraph" ? phrasingToMarks(first.children).text : "";
  const marker = CALLOUT_MARKER_RE.exec(firstText);

  if (first?.type === "paragraph" && marker) {
    const remainder = firstText.slice(marker[0].length);
    const { attrs } = splitTrailingAttrGroup(remainder.trim());
    const icon = marker[1] ?? "";
    const id = mint(state, path);
    const callout: Block = {
      id,
      ...withParent(cursor.parentId),
      type: "callout",
      props: icon.length > 0 ? { icon } : {},
      ...baseFields(attrs),
    };
    const children = parseScope(
      node.children.slice(1),
      { parentId: id, path },
      state
    );
    return [callout, ...children];
  }

  // Plain blockquote → one quote block; paragraphs join with newlines.
  const parts: RichText[] = node.children
    .filter((child): child is Paragraph => child.type === "paragraph")
    .map((paragraph) => phrasingToMarks(paragraph.children));
  let text = "";
  const marks: InlineMark[] = [];
  for (const part of parts) {
    if (text.length > 0) {
      text += "\n";
    }
    const offset = text.length;
    for (const mark of part.marks) {
      marks.push({
        ...mark,
        start: mark.start + offset,
        end: mark.end + offset,
      });
    }
    text += part.text;
  }
  const { attrs, text: stripped } = splitTrailingAttrGroup(text);
  return [
    {
      id: mint(state, path),
      ...withParent(cursor.parentId),
      type: "quote",
      props: {
        text: stripped,
        ...marksProp(normalizeInlineMarks(marks, stripped.length)),
      },
      ...baseFields(attrs),
    },
  ];
}

function parseCode(
  node: Code,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block {
  return {
    id: mint(state, path),
    ...withParent(cursor.parentId),
    type: "code",
    props: {
      text: node.value,
      ...(node.lang ? { language: node.lang } : {}),
    },
  };
}

interface CollectedItem {
  backgroundColor?: BlockColor;
  checked: boolean | null | undefined;
  color?: BlockColor;
  indent: number;
  marks: InlineMark[];
  text: string;
}

function collectListItems(
  list: List,
  depth: number,
  out: CollectedItem[]
): void {
  for (const item of list.children) {
    const paragraph = item.children.find(
      (child): child is Paragraph => child.type === "paragraph"
    );
    const { attrs, rich } = paragraph
      ? richTextWithAttrs(paragraph.children)
      : { attrs: {} as ParsedAttrs, rich: { marks: [], text: "" } };
    out.push({
      checked: item.checked,
      text: rich.text,
      marks: rich.marks,
      indent: Math.min(depth, MAX_INDENT),
      color: parseColor(attrs.color),
      backgroundColor: parseColor(attrs.bg),
    });
    for (const child of item.children) {
      if (child.type === "list") {
        collectListItems(child, depth + 1, out);
      }
    }
  }
}

function parseList(
  node: List,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const items: CollectedItem[] = [];
  collectListItems(node, 0, items);
  const checklist =
    items.length > 0 &&
    items.every((item) => item.checked !== null && item.checked !== undefined);

  const id = mint(state, path);
  const container: Block = checklist
    ? {
        id,
        ...withParent(cursor.parentId),
        type: "checklist",
        props: {},
      }
    : {
        id,
        ...withParent(cursor.parentId),
        type: "list",
        props: { variant: node.ordered ? "ordered" : "bullet" },
      };

  const children: Block[] = items.map((item, index) => {
    const base = {
      id: mint(state, [...path, index]),
      parentId: id,
      ...(item.indent > 0 ? { indent: item.indent } : {}),
      ...(item.color === undefined ? {} : { color: item.color }),
      ...(item.backgroundColor === undefined
        ? {}
        : { backgroundColor: item.backgroundColor }),
    };
    if (checklist) {
      return {
        ...base,
        type: "checklistItem",
        props: {
          checked: item.checked === true,
          text: item.text,
          ...marksProp(item.marks),
        },
      } as Block;
    }
    return {
      ...base,
      type: "text",
      props: { text: item.text, ...marksProp(item.marks) },
    } as Block;
  });

  return [container, ...children];
}

function parseTable(
  node: Table,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const id = mint(state, path);
  const columnCount = Math.max(
    1,
    ...node.children.map((row) => row.children.length)
  );
  const table: Block = {
    id,
    ...withParent(cursor.parentId),
    type: "table",
    props: {
      hasHeaderRow: true,
      hasHeaderColumn: false,
      columnWidths: new Array<number>(columnCount).fill(
        DEFAULT_TABLE_COLUMN_WIDTH
      ),
    },
  };

  const blocks: Block[] = [table];
  node.children.forEach((row, rowIndex) => {
    const rowId = mint(state, [...path, rowIndex]);
    blocks.push({
      id: rowId,
      parentId: id,
      type: "tableRow",
      props: {},
    });
    row.children.forEach((cell, cellIndex) => {
      const rich = phrasingToMarks(cell.children);
      blocks.push({
        id: mint(state, [...path, rowIndex, cellIndex]),
        parentId: rowId,
        type: "tableCell",
        props: { text: rich.text, ...marksProp(rich.marks) },
      });
    });
  });
  return blocks;
}

/** Apply a consumed `{…}` trailer to the container it follows. */
function applyTrailerAttrs(
  block: Block,
  attrs: ParsedAttrs,
  producedBlocks: Block[]
): void {
  const base = baseFields(attrs);
  Object.assign(block, base);

  if (block.type === "table") {
    if (attrs["no-header-row"] === true) {
      block.props.hasHeaderRow = false;
    }
    if (attrs["header-column"] === true) {
      block.props.hasHeaderColumn = true;
    }
    if (typeof attrs.widths === "string") {
      const widths = attrs.widths
        .split(",")
        .map((value) => Number.parseFloat(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (widths.length > 0) {
        block.props.columnWidths = widths;
      }
    }
    if (typeof attrs["row-heights"] === "string") {
      const heights = attrs["row-heights"].split(",");
      const rows = producedBlocks.filter(
        (candidate): candidate is Extract<Block, { type: "tableRow" }> =>
          candidate.type === "tableRow" && candidate.parentId === block.id
      );
      rows.forEach((row, index) => {
        const height = Number.parseFloat(heights[index] ?? "");
        if (Number.isFinite(height) && height > 0) {
          row.props.height = height;
        }
      });
    }
  }
}

function parseContainerDirective(
  node: ContainerDirective,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  switch (node.name) {
    case "columns":
      return parseColumns(node, cursor, path, state);
    case "tabs":
      return parseTabs(node, cursor, path, state);
    default:
      // Unknown/bare directives flatten into the current scope (lenient).
      return parseScope(node.children, cursor, state);
  }
}

function directiveBaseFields(
  attributes: ContainerDirective["attributes"]
): BlockBaseFields {
  const attrs: ParsedAttrs = {};
  for (const [key, value] of Object.entries(attributes ?? {})) {
    if (value !== null && value !== undefined) {
      attrs[key] = value === "" ? true : value;
    }
  }
  return baseFields(attrs);
}

function parseColumns(
  node: ContainerDirective,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const id = mint(state, path);
  const columns: Block = {
    id,
    ...withParent(cursor.parentId),
    type: "columns",
    props: {},
    ...directiveBaseFields(node.attributes),
  };
  const blocks: Block[] = [columns];
  let columnIndex = 0;
  for (const child of node.children) {
    if (child.type !== "containerDirective" || child.name !== "column") {
      continue;
    }
    const columnPath = [...path, columnIndex];
    const columnId = mint(state, columnPath);
    const width = parseNumber(
      child.attributes?.width === null ? undefined : child.attributes?.width
    );
    blocks.push({
      id: columnId,
      parentId: id,
      type: "column",
      props: width !== undefined && width > 0 ? { width } : {},
      ...directiveBaseFields(child.attributes),
    });
    blocks.push(
      ...parseScope(
        child.children,
        { parentId: columnId, path: columnPath },
        state
      )
    );
    columnIndex += 1;
  }
  return blocks;
}

const TAB_SIZES = new Set(["sm", "md", "lg"]);
const TAB_VARIANTS = new Set(["default", "indicator", "line"]);

function parseTabs(
  node: ContainerDirective,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const id = mint(state, path);
  const attributes = node.attributes ?? {};
  const size = attributes.size;
  const variant = attributes.variant;

  const blocks: Block[] = [];
  const tabIds: string[] = [];
  let tabIndex = 0;
  for (const child of node.children) {
    if (child.type !== "containerDirective" || child.name !== "tab") {
      continue;
    }
    const tabPath = [...path, tabIndex];
    const tabId = mint(state, tabPath);
    tabIds.push(tabId);
    const childAttributes = child.attributes ?? {};
    blocks.push({
      id: tabId,
      parentId: id,
      type: "tab",
      props: {
        label: childAttributes.label ?? "",
        ...(childAttributes.icon ? { icon: childAttributes.icon } : {}),
      },
      ...directiveBaseFields(childAttributes),
    });
    blocks.push(
      ...parseScope(child.children, { parentId: tabId, path: tabPath }, state)
    );
    tabIndex += 1;
  }

  const defaultIndex = parseNumber(
    attributes.default === null ? undefined : attributes.default
  );
  const defaultTabId =
    defaultIndex === undefined
      ? undefined
      : tabIds[Math.trunc(defaultIndex) - 1];

  const tabs: Block = {
    id,
    ...withParent(cursor.parentId),
    type: "tabs",
    props: {
      ...(defaultTabId === undefined ? {} : { defaultTabId }),
      ...(typeof size === "string" && TAB_SIZES.has(size)
        ? { size: size as "sm" | "md" | "lg" }
        : {}),
      ...(typeof variant === "string" && TAB_VARIANTS.has(variant)
        ? { variant: variant as "default" | "indicator" | "line" }
        : {}),
    },
    ...directiveBaseFields(attributes),
  };
  return [tabs, ...blocks];
}

function parseLeafDirective(
  node: LeafDirective,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  if (node.name !== "database") {
    // Foreign `::name` lines were literal prose; degrade to text.
    const label = phrasingToMarks(node.children).text;
    return [
      {
        id: mint(state, path),
        ...withParent(cursor.parentId),
        type: "text",
        props: {
          text: `::${node.name}${label.length > 0 ? `[${label}]` : ""}`,
        },
      },
    ];
  }
  const attributes = node.attributes ?? {};
  const databaseId = attributes.id;
  if (typeof databaseId !== "string" || databaseId.length === 0) {
    return [];
  }
  return [
    {
      id: mint(state, path),
      ...withParent(cursor.parentId),
      type: "database",
      props: {
        databaseId,
        ...(typeof attributes.view === "string" && attributes.view.length > 0
          ? { viewId: attributes.view }
          : {}),
        ...("hide-title" in attributes ? { hideTitle: true } : {}),
      },
      ...directiveBaseFields(attributes),
    },
  ];
}

function parseHtmlBlock(
  node: Html,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  const value = node.value.trim();
  if (value.length === 0) {
    return [];
  }
  return [
    {
      id: mint(state, path),
      ...withParent(cursor.parentId),
      type: "text",
      props: { text: node.value },
    },
  ];
}

/** Foreign constructs (definitions, footnotes, …) degrade to plain text. */
function parseFallback(
  node: RootContent,
  cursor: ScopeCursor,
  path: readonly number[],
  state: ParseState
): Block[] {
  let text = "";
  if ("children" in node && Array.isArray(node.children)) {
    text = phrasingToMarks(node.children as PhrasingContent[]).text;
  } else if ("value" in node && typeof node.value === "string") {
    text = node.value;
  }
  if (text.trim().length === 0) {
    return [];
  }
  return [
    {
      id: mint(state, path),
      ...withParent(cursor.parentId),
      type: "text",
      props: { text },
    },
  ];
}
