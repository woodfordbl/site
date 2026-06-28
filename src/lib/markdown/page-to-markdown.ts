/**
 * Serializes a page's block tree to a single Markdown document.
 *
 * This is a portability-focused, lossy export (paste into other Markdown
 * tools), distinct from the lossless `.zip` workspace archive. Inline text is
 * stored as plain strings in this app, so block-level structure (headings,
 * lists, code, quotes, tables, checklists) is what maps; any literal Markdown a
 * user typed inside a text block round-trips verbatim.
 */

import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import { getTextFromBlock } from "@/lib/blocks/create-block.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { Page } from "@/lib/schemas/page.ts";

export interface PageDirectoryEntry {
  slug: string;
  title: string;
}

export interface PageToMarkdownOptions {
  /** Maps a `pageLink` target id to its title/slug so links resolve to text + href. */
  pageDirectory?: Map<string, PageDirectoryEntry>;
}

const EXTRA_BLANK_LINES_RE = /\n{3,}/g;

/** An icon prop is an emoji unless it uses the `tabler:Name` glyph encoding. */
function emojiIcon(icon: string | undefined): string | null {
  if (!icon || icon.startsWith("tabler:")) {
    return null;
  }
  return icon;
}

function headingPrefix(level: number): string {
  return "#".repeat(Math.min(Math.max(level, 1), 6));
}

function blockquote(text: string): string {
  const body = text.length > 0 ? text : "";
  return body
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"))
    .join("\n");
}

function fencedCode(text: string, language: string | undefined): string {
  return `\`\`\`${language ?? ""}\n${text}\n\`\`\``;
}

function listChunk(row: CanvasRow): string {
  const block = row.effectiveBlock;
  const indent = "  ".repeat(block.indent ?? 0);
  const ordered = block.type === "list" && block.props.variant === "ordered";

  return row.children
    .map((child, index) => {
      const marker = ordered ? `${index + 1}.` : "-";
      return `${indent}${marker} ${getTextFromBlock(child.effectiveBlock)}`;
    })
    .join("\n");
}

function checklistChunk(row: CanvasRow): string {
  const indent = "  ".repeat(row.effectiveBlock.indent ?? 0);

  return row.children
    .map((child) => {
      const item = child.effectiveBlock;
      const checked =
        item.type === "checklistItem" && item.props.checked ? "x" : " ";
      const text =
        item.type === "checklistItem"
          ? item.props.text
          : getTextFromBlock(item);
      return `${indent}- [${checked}] ${text}`;
    })
    .join("\n");
}

function escapeCell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function tableChunk(row: CanvasRow): string {
  const rows = row.children.filter(
    (child) => child.effectiveBlock.type === "tableRow"
  );
  if (rows.length === 0) {
    return "";
  }

  const matrix = rows.map((tableRow) =>
    tableRow.children
      .filter((cell) => cell.effectiveBlock.type === "tableCell")
      .map((cell) => escapeCell(getTextFromBlock(cell.effectiveBlock)))
  );

  const columnCount = Math.max(...matrix.map((cells) => cells.length), 1);
  const pad = (cells: string[]) => {
    const next = [...cells];
    while (next.length < columnCount) {
      next.push("");
    }
    return next;
  };

  const [header, ...body] = matrix;
  const lines = [
    `| ${pad(header).join(" | ")} |`,
    `| ${Array.from({ length: columnCount }, () => "---").join(" | ")} |`,
    ...body.map((cells) => `| ${pad(cells).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function mediaChunk(block: Extract<Block, { type: "media" }>): string {
  const href =
    block.props.source === "asset"
      ? `asset:${block.props.src}`
      : block.props.src;
  const label = block.props.alt ?? "";
  if (block.props.kind === "video") {
    return `[${label || "video"}](${href})`;
  }
  return `![${label}](${href})`;
}

function embedChunk(block: Extract<Block, { type: "embed" }>): string {
  const label = block.props.title || block.props.caption || block.props.url;
  return `[${label}](${block.props.url})`;
}

function pageLinkChunk(
  block: Extract<Block, { type: "pageLink" }>,
  pageDirectory: Map<string, PageDirectoryEntry> | undefined
): string {
  const entry = pageDirectory?.get(block.props.pageId);
  if (!entry) {
    return "[Untitled page](#)";
  }
  return `[${entry.title || "Untitled page"}](${entry.slug})`;
}

/** Renders a forest of rows into Markdown chunks (joined by blank lines). */
function renderRows(
  rows: CanvasRow[],
  options: PageToMarkdownOptions
): string[] {
  const chunks: string[] = [];

  for (const row of rows) {
    const block = row.effectiveBlock;

    switch (block.type) {
      case "heading":
        chunks.push(`${headingPrefix(block.props.level)} ${block.props.text}`);
        break;
      case "toggleHeading":
        chunks.push(`${headingPrefix(block.props.level)} ${block.props.text}`);
        chunks.push(...renderRows(row.children, options));
        break;
      case "text":
        chunks.push(block.props.text);
        break;
      case "quote":
        chunks.push(blockquote(block.props.text));
        break;
      case "callout": {
        const icon = emojiIcon(block.props.icon);
        chunks.push(
          blockquote(icon ? `${icon} ${block.props.text}` : block.props.text)
        );
        break;
      }
      case "code":
        chunks.push(fencedCode(block.props.text, block.props.language));
        break;
      case "divider":
        chunks.push("---");
        break;
      case "list":
        chunks.push(listChunk(row));
        break;
      case "checklist":
        chunks.push(checklistChunk(row));
        break;
      case "table":
        chunks.push(tableChunk(row));
        break;
      case "media":
        chunks.push(mediaChunk(block));
        break;
      case "embed":
        chunks.push(embedChunk(block));
        break;
      case "pageLink":
        chunks.push(pageLinkChunk(block, options.pageDirectory));
        break;
      // Layout containers have no Markdown equivalent: flatten their children.
      case "columns":
      case "column":
      case "tabs":
      case "tab":
        chunks.push(...renderRows(row.children, options));
        break;
      default:
        break;
    }
  }

  return chunks.filter((chunk) => chunk !== undefined);
}

/** Serializes a page to a Markdown document, leading with an H1 title. */
export function pageToMarkdown(
  page: Page,
  options: PageToMarkdownOptions = {}
): string {
  const icon = emojiIcon(page.icon);
  const title = page.title.trim() || "Untitled";
  const heading = `# ${icon ? `${icon} ` : ""}${title}`;

  const body = renderRows(buildBlockTree(page.blocks), options);
  const document = [heading, ...body]
    .join("\n\n")
    .replace(EXTRA_BLANK_LINES_RE, "\n\n")
    .trimEnd();
  return `${document}\n`;
}
