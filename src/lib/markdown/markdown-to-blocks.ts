/**
 * Parses a Markdown document into a flat list of blocks (with `parentId`/
 * `indent`) plus the page title/icon, for importing a `.md` file as a new page.
 *
 * Block-level constructs only — inline marks aren't modeled in this app, so
 * inline Markdown inside a line is kept as literal text. Constructs with no
 * native block type (HTML, footnotes, etc.) fall through to plain paragraphs.
 */
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface ParsedMarkdownPage {
  blocks: Block[];
  icon?: string;
  title: string | null;
}

// Leading emoji (incl. ZWJ sequences / variation selectors) used as a page icon.
const LEADING_EMOJI_RE =
  /^(\p{Extended_Pictographic}(‍\p{Extended_Pictographic}|[︀-️\u{1f3fb}-\u{1f3ff}])*)\s+/u;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```(.*)$/;
const UNORDERED_RE = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_RE = /^(\s*)\d+\.\s+(.*)$/;
const CHECKLIST_RE = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)$/;
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|?\s*$/;
const HRULE_RE = /^(-{3,}|\*{3,}|_{3,})$/;
const QUOTE_RE = /^>\s?/;
const LEADING_PIPE_RE = /^\|/;
const TRAILING_PIPE_RE = /\|$/;
const CRLF_RE = /\r\n?/g;
const ASSET_PREFIX = "asset:";

/** A matched block construct plus the line index to resume scanning from. */
interface ParseResult {
  blocks: Block[];
  next: number;
}

function indentFromSpaces(spaces: string): number {
  return Math.min(Math.floor(spaces.length / 2), 4);
}

function withProps<T extends Block>(block: T, props: T["props"]): T {
  return { ...block, props };
}

function isTableSeparator(line: string): boolean {
  return line.includes("-") && TABLE_SEPARATOR_RE.test(line);
}

function splitTableRow(line: string): string[] {
  const trimmed = line
    .trim()
    .replace(LEADING_PIPE_RE, "")
    .replace(TRAILING_PIPE_RE, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseFence(lines: string[], start: number): ParseResult | null {
  const fence = FENCE_RE.exec(lines[start]);
  if (!fence) {
    return null;
  }
  const language = fence[1].trim();
  const code: string[] = [];
  let cursor = start + 1;
  while (cursor < lines.length && !FENCE_RE.test(lines[cursor])) {
    code.push(lines[cursor]);
    cursor++;
  }
  return {
    blocks: [
      withProps(createEmptyBlock("code"), {
        text: code.join("\n"),
        ...(language ? { language } : {}),
      }),
    ],
    // Skip the closing fence line (cursor sits on it, or at EOF).
    next: cursor + 1,
  };
}

function parseChecklist(lines: string[], start: number): ParseResult | null {
  const first = CHECKLIST_RE.exec(lines[start]);
  if (!first) {
    return null;
  }
  const indent = indentFromSpaces(first[1]);
  const container = createEmptyBlock("checklist");
  container.indent = indent;
  const items: Block[] = [];
  let cursor = start;
  while (cursor < lines.length) {
    const match = CHECKLIST_RE.exec(lines[cursor]);
    if (!match || indentFromSpaces(match[1]) !== indent) {
      break;
    }
    const item = withProps(createEmptyBlock("checklistItem"), {
      checked: match[2].toLowerCase() === "x",
      text: match[3].trim(),
    });
    item.parentId = container.id;
    items.push(item);
    cursor++;
  }
  return { blocks: [container, ...items], next: cursor };
}

function parseList(lines: string[], start: number): ParseResult | null {
  const ordered = ORDERED_RE.exec(lines[start]);
  const unordered = ordered ? null : UNORDERED_RE.exec(lines[start]);
  const match = ordered ?? unordered;
  if (!match || (!ordered && CHECKLIST_RE.test(lines[start]))) {
    return null;
  }
  const indent = indentFromSpaces(match[1]);
  const container = withProps(createEmptyBlock("list"), {
    variant: ordered ? "ordered" : "bullet",
  });
  container.indent = indent;
  const rowRe = ordered ? ORDERED_RE : UNORDERED_RE;
  const items: Block[] = [];
  let cursor = start;
  while (cursor < lines.length) {
    const row = rowRe.exec(lines[cursor]);
    if (
      !row ||
      indentFromSpaces(row[1]) !== indent ||
      CHECKLIST_RE.test(lines[cursor])
    ) {
      break;
    }
    const item = withProps(createEmptyBlock("text"), { text: row[2].trim() });
    item.parentId = container.id;
    items.push(item);
    cursor++;
  }
  return { blocks: [container, ...items], next: cursor };
}

function parseQuote(lines: string[], start: number): ParseResult | null {
  if (!QUOTE_RE.test(lines[start])) {
    return null;
  }
  const quoteLines: string[] = [];
  let cursor = start;
  while (cursor < lines.length && QUOTE_RE.test(lines[cursor])) {
    quoteLines.push(lines[cursor].replace(QUOTE_RE, ""));
    cursor++;
  }
  return {
    blocks: [
      withProps(createEmptyBlock("quote"), {
        text: quoteLines.join("\n").trim(),
      }),
    ],
    next: cursor,
  };
}

function parseImage(line: string): ParseResult | null {
  const image = IMAGE_RE.exec(line.trim());
  if (!image) {
    return null;
  }
  const href = image[2].trim();
  const asset = href.startsWith(ASSET_PREFIX);
  return {
    blocks: [
      withProps(createEmptyBlock("media"), {
        kind: "image",
        source: asset ? "asset" : "url",
        src: asset ? href.slice(ASSET_PREFIX.length) : href,
        ...(image[1] ? { alt: image[1] } : {}),
      }),
    ],
    next: 0,
  };
}

function parseTable(lines: string[], start: number): ParseResult | null {
  if (
    !lines[start].includes("|") ||
    start + 1 >= lines.length ||
    !isTableSeparator(lines[start + 1])
  ) {
    return null;
  }
  const bodyRows: string[][] = [];
  let cursor = start + 2;
  while (
    cursor < lines.length &&
    lines[cursor].includes("|") &&
    lines[cursor].trim().length > 0
  ) {
    bodyRows.push(splitTableRow(lines[cursor]));
    cursor++;
  }
  const matrix = [splitTableRow(lines[start]), ...bodyRows];
  const columnCount = Math.max(...matrix.map((row) => row.length), 1);
  const table = withProps(createEmptyBlock("table"), {
    hasHeaderRow: true,
    hasHeaderColumn: false,
    columnWidths: Array.from({ length: columnCount }, () => 120),
  });
  const children: Block[] = [];
  for (const cells of matrix) {
    const tableRow = createEmptyBlock("tableRow");
    tableRow.parentId = table.id;
    children.push(tableRow);
    for (let col = 0; col < columnCount; col++) {
      const cell = withProps(createEmptyBlock("tableCell"), {
        text: cells[col] ?? "",
      });
      cell.parentId = tableRow.id;
      children.push(cell);
    }
  }
  return { blocks: [table, ...children], next: cursor };
}

/** Construct parsers that span (or may span) multiple lines, tried in order. */
const MULTILINE_PARSERS = [
  parseFence,
  parseChecklist,
  parseList,
  parseQuote,
  parseTable,
];

/** Parses a Markdown string into blocks plus the inferred page title/icon. */
export function markdownToBlocks(markdown: string): ParsedMarkdownPage {
  const lines = markdown.replace(CRLF_RE, "\n").split("\n");
  const blocks: Block[] = [];
  const state = {
    title: null as string | null,
    icon: undefined as string | undefined,
  };
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text.length > 0) {
      blocks.push(withProps(createEmptyBlock("text"), { text }));
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    if (consumeHeading(line, state, blocks, flushParagraph)) {
      continue;
    }

    if (HRULE_RE.test(line.trim())) {
      flushParagraph();
      blocks.push(createEmptyBlock("divider"));
      continue;
    }

    const image = parseImage(line);
    if (image) {
      flushParagraph();
      blocks.push(...image.blocks);
      continue;
    }

    const result = runMultilineParsers(lines, i);
    if (result) {
      flushParagraph();
      blocks.push(...result.blocks);
      i = result.next - 1;
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  return {
    title: state.title,
    ...(state.icon ? { icon: state.icon } : {}),
    blocks,
  };
}

/** Handles a heading line: the first H1 sets the title/icon, others are blocks. */
function consumeHeading(
  line: string,
  state: { title: string | null; icon: string | undefined },
  blocks: Block[],
  flushParagraph: () => void
): boolean {
  const heading = HEADING_RE.exec(line);
  if (!heading) {
    return false;
  }
  flushParagraph();
  const level = heading[1].length;
  let text = heading[2].trim();
  if (level === 1 && state.title === null) {
    const emoji = LEADING_EMOJI_RE.exec(text);
    if (emoji) {
      state.icon = emoji[1];
      text = text.slice(emoji[0].length).trim();
    }
    state.title = text;
    return true;
  }
  blocks.push(
    withProps(createEmptyBlock("heading"), {
      level: Math.min(level, 4) as 1 | 2 | 3 | 4,
      text,
    })
  );
  return true;
}

function runMultilineParsers(
  lines: string[],
  start: number
): ParseResult | null {
  for (const parser of MULTILINE_PARSERS) {
    const result = parser(lines, start);
    if (result) {
      return result;
    }
  }
  return null;
}
