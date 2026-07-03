import type { Block } from "@/lib/schemas/block.ts";

/**
 * Extracts the human-readable text from a single block (its own text only;
 * nested children are separate blocks and contribute on their own). Mirrors the
 * text-bearing cases in `page-word-count.ts` so word counts and word-frequency
 * stay consistent.
 */
export function getBlockText(block: Block): string {
  switch (block.type) {
    case "text":
    case "heading":
    case "toggleHeading":
    case "quote":
    case "tableCell":
    case "checklistItem":
    case "code":
      return block.props.text;
    case "embed":
      return block.props.caption ?? "";
    case "media":
      return block.props.alt ?? "";
    case "list":
    case "checklist":
    case "callout":
    case "columns":
    case "column":
    case "tabs":
    case "tab":
    case "divider":
    case "pageLink":
    case "table":
    case "tableRow":
    case "database":
      return "";
    default: {
      const neverBlock: never = block;
      return neverBlock;
    }
  }
}

/** Concatenated text across a page's blocks, newline-separated. */
export function getBlocksText(blocks: Block[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const text = getBlockText(block);
    if (text) {
      parts.push(text);
    }
  }
  return parts.join("\n");
}
