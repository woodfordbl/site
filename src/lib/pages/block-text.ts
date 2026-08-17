import { projectPlainText } from "@/lib/blocks/inline-formula.ts";
import { getBlockMarks } from "@/lib/blocks/rich-text.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * Extracts the HUMAN-READABLE text from a single block (its own text only;
 * nested children are separate blocks and contribute on their own). Mirrors the
 * text-bearing cases in `page-word-count.ts` so word counts and word-frequency
 * stay consistent.
 *
 * "Human-readable" is load-bearing since inline formula tokens exist: a token
 * occupies one U+FFFC sentinel in `props.text`, so anything shown to a person
 * or fed to an index must project it to the rendered value first
 * (`docs/proposals/inline-prose-tokens.md`). Callers that hold values pass
 * them; without them a token reads as the pending placeholder, never a raw
 * sentinel.
 *
 * The counterpart is deliberate: STRUCTURAL readers — block-type conversion,
 * link detection, anything that writes text back — must keep using
 * `getTextFromBlock`, which returns the canonical string. Projecting there
 * would bake a value into stored text, which is the exact corruption the
 * sentinel design exists to prevent.
 */
export function getBlockText(
  block: Block,
  formulaValues?: ReadonlyMap<number, string>
): string {
  const raw = rawBlockText(block);
  if (raw === "") {
    return raw;
  }
  return projectPlainText(raw, getBlockMarks(block), {
    ...(formulaValues === undefined ? {} : { values: formulaValues }),
  });
}

/** The block's own stored text, before any token projection. */
function rawBlockText(block: Block): string {
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
    case "map":
      return "";
    default: {
      const neverBlock: never = block;
      return neverBlock;
    }
  }
}

/** Concatenated text across a page's blocks, newline-separated. */
export function getBlocksText(
  blocks: Block[],
  formulaValues?: ReadonlyMap<number, string>
): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const text = getBlockText(block, formulaValues);
    if (text) {
      parts.push(text);
    }
  }
  return parts.join("\n");
}
