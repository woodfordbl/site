import { getSlashMenuItems } from "@/components/blocks/registry.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  getTextFromBlock,
  stripSlashCommandText,
} from "@/lib/blocks/create-block.ts";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { MarkdownShortcutMatch } from "@/lib/canvas/markdown-shortcuts.ts";

export function markdownMatchToSlashItem(
  match: MarkdownShortcutMatch
): SlashMenuItem {
  const items = getSlashMenuItems();

  if (match.kind === "heading") {
    const item = items.find(
      (entry) => entry.id === "heading" && entry.headingLevel === match.level
    );
    if (!item) {
      throw new Error(
        `Missing slash menu item for heading level ${match.level}`
      );
    }
    return item;
  }

  if (match.kind === "list") {
    const item = items.find(
      (entry) => entry.id === "list" && entry.listVariant === match.variant
    );
    if (!item) {
      throw new Error(
        `Missing slash menu item for list variant ${match.variant}`
      );
    }
    return item;
  }

  if (match.kind === "checklist") {
    const item = items.find((entry) => entry.id === "checklist");
    if (!item) {
      throw new Error("Missing slash menu item for checklist");
    }
    return item;
  }

  const item = items.find((entry) => entry.id === "divider");
  if (!item) {
    throw new Error("Missing slash menu item for divider");
  }
  return item;
}

export function applyBlockConversion(
  row: CanvasRow,
  item: SlashMenuItem,
  dispatch: (command: CanvasCommand) => void,
  options?: { text?: string; absorb?: boolean }
): void {
  const cleanedText =
    options?.text ??
    stripSlashCommandText(getTextFromBlock(row.effectiveBlock));

  if (item.id === "toggleHeading") {
    dispatch({
      type: "toggleHeading.create",
      rowId: row.rowId,
      level: item.toggleHeadingLevel ?? 1,
      text: cleanedText,
      absorb: options?.absorb ?? false,
    });
  } else if (item.id === "list" || item.id === "checklist") {
    dispatch({
      type: "container.wrap",
      rowId: row.rowId,
      containerType: item.id,
      variant: item.listVariant ?? "bullet",
      childText: cleanedText,
    });
  } else if (item.id === "columns") {
    dispatch({
      type: "columns.create",
      rowId: row.rowId,
      count: item.columnCount ?? 2,
      text: cleanedText,
    });
  } else if (item.id === "tabs") {
    dispatch({
      type: "tabs.create",
      rowId: row.rowId,
      count: item.tabCount ?? 2,
      text: cleanedText,
    });
  } else if (item.id === "table") {
    dispatch({
      type: "table.create",
      rowId: row.rowId,
      columns: item.tableColumns ?? 3,
      rows: item.tableRows ?? 3,
      text: cleanedText,
    });
  } else {
    dispatch({
      type: "slash.convert",
      rowId: row.rowId,
      to: item.id,
      text: cleanedText,
      headingLevel: item.headingLevel,
    });
  }
}
