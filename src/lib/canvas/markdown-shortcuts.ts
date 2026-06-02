import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";

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

/** List, divider, and heading shortcuts only apply on top-level canvas rows. */
export function requiresTopLevelRow(match: MarkdownShortcutMatch): boolean {
  return (
    match.kind === "list" ||
    match.kind === "checklist" ||
    match.kind === "divider" ||
    match.kind === "heading"
  );
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
