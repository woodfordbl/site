import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { BlockType } from "@/lib/schemas/block.ts";

export type MarkdownShortcutMatch =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 }
  | { kind: "list"; variant: "bullet" | "ordered" }
  | { kind: "checklist" }
  | { kind: "divider" };

const MARKDOWN_SHORTCUTS: Record<string, MarkdownShortcutMatch> = {
  "#": { kind: "heading", level: 1 },
  "##": { kind: "heading", level: 2 },
  "###": { kind: "heading", level: 3 },
  "####": { kind: "heading", level: 4 },
  "-": { kind: "list", variant: "bullet" },
  "1.": { kind: "list", variant: "ordered" },
  "[]": { kind: "checklist" },
  "---": { kind: "divider" },
};

export function matchMarkdownShortcut(
  text: string
): MarkdownShortcutMatch | null {
  return MARKDOWN_SHORTCUTS[text] ?? null;
}

/**
 * The block type a markdown shortcut produces. List and checklist shortcuts
 * wrap the row in a container of that type; heading and divider convert it in
 * place. Used to check whether a parent container accepts the result, so the
 * shortcut works inside generic-scope containers (toggle headings, columns,
 * tabs) while staying blocked inside type-restricted ones (lists, checklists).
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
    default:
      return "divider";
  }
}

export function getMarkdownShortcutHint(
  item: SlashMenuItem
): string | undefined {
  if (item.id === "heading" && item.headingLevel) {
    return "#".repeat(item.headingLevel);
  }

  if (item.id === "list") {
    return item.listVariant === "ordered" ? "1." : "-";
  }

  if (item.id === "checklist") {
    return "[]";
  }

  if (item.id === "divider") {
    return "---";
  }

  return;
}
