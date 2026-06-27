import type { Block } from "@/lib/schemas/block.ts";

const WORD_PATTERN = /\S+/g;

function countWordsInText(text: string): number {
  const matches = text.match(WORD_PATTERN);
  return matches?.length ?? 0;
}

function countWordsInBlock(block: Block): number {
  switch (block.type) {
    case "text":
      return countWordsInText(block.props.text);
    case "heading":
      return countWordsInText(block.props.text);
    case "quote":
      return countWordsInText(block.props.text);
    case "tableCell":
      return countWordsInText(block.props.text);
    case "checklistItem":
      return countWordsInText(block.props.text);
    case "callout":
      return countWordsInText(block.props.text);
    case "embed":
      return countWordsInText(block.props.caption ?? "");
    case "media":
      return countWordsInText(block.props.alt ?? "");
    case "list":
    case "checklist":
    case "columns":
    case "column":
    case "tabs":
    case "tab":
    case "divider":
    case "pageLink":
    case "table":
    case "tableRow":
      return 0;
    default: {
      const neverBlock: never = block;
      return neverBlock;
    }
  }
}

/** Counts words across all blocks on a page (nested blocks included). */
export function countPageWords(blocks: Block[]): number {
  let total = 0;
  for (const block of blocks) {
    total += countWordsInBlock(block);
  }
  return total;
}
