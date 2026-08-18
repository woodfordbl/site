/**
 * @fileoverview Markdown block shortcuts: the prefix a user types at the start
 * of an empty-ish row, which Space converts into another block type.
 *
 * {@link MARKDOWN_SHORTCUTS} is the single table both directions read — the
 * match (typed text → block) and the slash-menu hint (block → typed text) — so
 * a spelling can never be offered in the menu without being accepted by the
 * field. Where a block has several accepted spellings, the first one listed is
 * the one the menu advertises.
 */
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { BlockType } from "@/lib/schemas/block.ts";

export type MarkdownShortcutMatch =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 }
  | { kind: "list"; variant: "bullet" | "ordered" }
  | { kind: "checklist" }
  | { kind: "quote" }
  | { kind: "code" }
  | { kind: "divider" };

/**
 * Typed prefix → block conversion. Matching is exact against the row's whole
 * text, so a prefix mid-sentence is never a shortcut and no spelling here can
 * shadow another.
 */
const MARKDOWN_SHORTCUTS: Record<string, MarkdownShortcutMatch> = {
  "#": { kind: "heading", level: 1 },
  "##": { kind: "heading", level: 2 },
  "###": { kind: "heading", level: 3 },
  "####": { kind: "heading", level: 4 },
  "-": { kind: "list", variant: "bullet" },
  "*": { kind: "list", variant: "bullet" },
  "+": { kind: "list", variant: "bullet" },
  "1.": { kind: "list", variant: "ordered" },
  "1)": { kind: "list", variant: "ordered" },
  "[]": { kind: "checklist" },
  "[ ]": { kind: "checklist" },
  ">": { kind: "quote" },
  "```": { kind: "code" },
  "---": { kind: "divider" },
  "***": { kind: "divider" },
  ___: { kind: "divider" },
};

export function matchMarkdownShortcut(
  text: string
): MarkdownShortcutMatch | null {
  return MARKDOWN_SHORTCUTS[text] ?? null;
}

/**
 * The block type a markdown shortcut produces. List and checklist shortcuts
 * wrap the row in a container of that type; the rest convert it in place. Used
 * to check whether a parent container accepts the result, so the shortcut works
 * inside generic-scope containers (toggle headings, columns, tabs) while
 * staying blocked inside type-restricted ones (lists, checklists).
 */
export function markdownShortcutResultType(
  match: MarkdownShortcutMatch
): BlockType {
  switch (match.kind) {
    case "heading":
      return "heading";
    case "list":
      return "list";
    case "checklist":
      return "checklist";
    case "quote":
      return "quote";
    case "code":
      return "code";
    default:
      return "divider";
  }
}

/**
 * Whether `match` is the shortcut that produces `item`'s block — the identity
 * both the menu hint and the conversion lookup resolve a match by.
 */
export function markdownShortcutMatchesItem(
  match: MarkdownShortcutMatch,
  item: SlashMenuItem
): boolean {
  if (markdownShortcutResultType(match) !== item.id) {
    return false;
  }
  if (match.kind === "heading") {
    return match.level === item.headingLevel;
  }
  if (match.kind === "list") {
    return match.variant === item.listVariant;
  }
  return true;
}

/** The spelling the slash menu advertises for `item`, if it has one. */
export function getMarkdownShortcutHint(
  item: SlashMenuItem
): string | undefined {
  return Object.entries(MARKDOWN_SHORTCUTS).find(([, match]) =>
    markdownShortcutMatchesItem(match, item)
  )?.[0];
}
