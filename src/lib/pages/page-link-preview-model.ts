import { getBlockIndent } from "@/lib/blocks/block-indent.ts";
import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * A page reduced to the handful of lines a hover card can show.
 *
 * The card is a summary, not a viewport onto the page: it abstracts each block
 * to one line so a 320x240 popover stays legible, and so hovering a link never
 * mounts the machinery a real block needs (a live database grid, the Shiki
 * highlighter, IndexedDB asset reads). Rendering is the card's job — this file
 * only decides what survives the reduction.
 */

/** Lines rendered before the rest is reported as a count. */
export const PAGE_LINK_PREVIEW_LINE_LIMIT = 7;

/** Deepest list indent the card draws; deeper items render at this depth. */
export const PAGE_LINK_PREVIEW_MAX_DEPTH = 2;

export type PageLinkPreviewLine =
  | { id: string; kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { id: string; kind: "text"; text: string }
  | { id: string; kind: "quote"; text: string }
  | { icon?: string; id: string; kind: "callout"; text: string }
  | {
      depth: number;
      id: string;
      index?: number;
      kind: "bullet";
      ordered: boolean;
      text: string;
    }
  | {
      checked: boolean;
      depth: number;
      id: string;
      kind: "checklist";
      text: string;
    }
  | { id: string; kind: "divider" }
  | { id: string; kind: "code"; language?: string; text: string }
  | {
      id: string;
      kind: "media";
      mediaKind: "image" | "video";
      text: string;
    }
  | { id: string; kind: "embed"; text: string }
  | { columns: string[]; id: string; kind: "table" }
  | { databaseId: string; id: string; kind: "database" }
  | { id: string; kind: "pageLink"; pageId: string };

export interface PageLinkPreviewBody {
  /** Lines the limit cut, reported to the reader rather than silently dropped. */
  hiddenCount: number;
  lines: PageLinkPreviewLine[];
}

/** Header labels shown for a `table` block. */
const TABLE_PREVIEW_COLUMN_LIMIT = 3;

function clampDepth(depth: number): number {
  return Math.min(PAGE_LINK_PREVIEW_MAX_DEPTH, Math.max(0, depth));
}

function rowText(row: CanvasRow): string {
  const block = row.effectiveBlock;
  if ("text" in block.props && typeof block.props.text === "string") {
    return block.props.text.trim();
  }
  return "";
}

function firstNonEmptyLine(source: string): string {
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") {
      return trimmed;
    }
  }
  return "";
}

function collectRows(
  rows: readonly CanvasRow[],
  depth: number,
  out: PageLinkPreviewLine[]
): void {
  for (const row of rows) {
    collectRow(row, depth, out);
  }
}

function collectListItems(
  row: CanvasRow,
  ordered: boolean,
  depth: number,
  out: PageLinkPreviewLine[]
): void {
  let index = 0;
  for (const child of row.children) {
    const text = rowText(child);
    if (text === "") {
      continue;
    }
    index += 1;
    out.push({
      id: child.rowId,
      kind: "bullet",
      depth: clampDepth(depth + getBlockIndent(child.effectiveBlock)),
      ordered,
      text,
      ...(ordered ? { index } : {}),
    });
  }
}

function collectChecklistItems(
  row: CanvasRow,
  depth: number,
  out: PageLinkPreviewLine[]
): void {
  for (const child of row.children) {
    const block = child.effectiveBlock;
    if (block.type !== "checklistItem") {
      continue;
    }
    const text = block.props.text.trim();
    if (text === "") {
      continue;
    }
    out.push({
      checked: block.props.checked,
      depth: clampDepth(depth + getBlockIndent(block)),
      id: child.rowId,
      kind: "checklist",
      text,
    });
  }
}

function tableHeaderLabels(row: CanvasRow): string[] {
  const headerRow = row.children[0];
  if (!headerRow) {
    return [];
  }
  return headerRow.children
    .slice(0, TABLE_PREVIEW_COLUMN_LIMIT)
    .map((cell) => rowText(cell));
}

/** Compile-time only: a new block type must decide how it previews. */
function assertBlockPreviewed(_block: never): void {
  return;
}

// One arm per block type keeps new types from silently vanishing from previews.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: flat dispatch over the block union
function collectRow(
  row: CanvasRow,
  depth: number,
  out: PageLinkPreviewLine[]
): void {
  const block = row.effectiveBlock;
  const id = row.rowId;

  switch (block.type) {
    case "text": {
      const text = block.props.text.trim();
      // Pages carry trailing blank rows by design (the canvas keeps at least
      // one). Rendering them faithfully would spend the card on whitespace.
      if (text !== "") {
        out.push({ id, kind: "text", text });
      }
      return;
    }
    case "quote": {
      const text = block.props.text.trim();
      if (text !== "") {
        out.push({ id, kind: "quote", text });
      }
      return;
    }
    case "heading": {
      const text = block.props.text.trim();
      if (text !== "") {
        out.push({ id, kind: "heading", level: block.props.level, text });
      }
      return;
    }
    case "toggleHeading": {
      const text = block.props.text.trim();
      if (text !== "") {
        out.push({ id, kind: "heading", level: block.props.level, text });
      }
      if (block.props.collapsed !== true) {
        collectRows(row.children, depth, out);
      }
      return;
    }
    case "callout": {
      const text =
        row.children.map(rowText).find((entry) => entry !== "") ?? "";
      out.push({
        id,
        kind: "callout",
        text,
        ...(block.props.icon === undefined ? {} : { icon: block.props.icon }),
      });
      return;
    }
    case "list": {
      collectListItems(row, block.props.variant === "ordered", depth, out);
      return;
    }
    case "checklist": {
      collectChecklistItems(row, depth, out);
      return;
    }
    case "checklistItem": {
      const text = block.props.text.trim();
      if (text !== "") {
        out.push({
          checked: block.props.checked,
          depth: clampDepth(depth),
          id,
          kind: "checklist",
          text,
        });
      }
      return;
    }
    case "columns":
    case "column":
    case "tab": {
      collectRows(row.children, depth, out);
      return;
    }
    case "tabs": {
      // Only the open tab is on screen for a reader, so only it is the page.
      const active =
        row.children.find(
          (child) => child.rowId === block.props.defaultTabId
        ) ?? row.children[0];
      if (active) {
        collectRow(active, depth, out);
      }
      return;
    }
    case "divider": {
      out.push({ id, kind: "divider" });
      return;
    }
    case "code": {
      out.push({
        id,
        kind: "code",
        text: firstNonEmptyLine(block.props.text),
        ...(block.props.language === undefined
          ? {}
          : { language: block.props.language }),
      });
      return;
    }
    case "media": {
      const label =
        block.props.alt?.trim() ||
        block.props.fileName?.trim() ||
        (block.props.kind === "video" ? "Video" : "Image");
      out.push({ id, kind: "media", mediaKind: block.props.kind, text: label });
      return;
    }
    case "embed": {
      const label =
        block.props.title?.trim() ||
        block.props.caption?.trim() ||
        block.props.url.trim() ||
        "Embed";
      out.push({ id, kind: "embed", text: label });
      return;
    }
    case "table": {
      out.push({ columns: tableHeaderLabels(row), id, kind: "table" });
      return;
    }
    case "database": {
      out.push({ databaseId: block.props.databaseId, id, kind: "database" });
      return;
    }
    case "pageLink": {
      out.push({ id, kind: "pageLink", pageId: block.props.pageId });
      return;
    }
    // Reachable only outside their container, where they carry no meaning.
    case "tableRow":
    case "tableCell": {
      return;
    }
    default:
      assertBlockPreviewed(block);
  }
}

/** Every preview line a page yields, before the card's limit is applied. */
export function pageLinkPreviewLines(blocks: Block[]): PageLinkPreviewLine[] {
  const lines: PageLinkPreviewLine[] = [];
  collectRows(buildBlockTree(blocks), 0, lines);
  return lines;
}

/** The page's preview lines capped at `limit`, with the remainder counted. */
export function buildPageLinkPreviewBody(
  blocks: Block[],
  limit: number = PAGE_LINK_PREVIEW_LINE_LIMIT
): PageLinkPreviewBody {
  const lines = pageLinkPreviewLines(blocks);
  return {
    hiddenCount: Math.max(0, lines.length - limit),
    lines: lines.slice(0, limit),
  };
}
