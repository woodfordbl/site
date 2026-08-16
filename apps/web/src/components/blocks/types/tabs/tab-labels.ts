import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

/** A tab's display name, falling back to `Tab N` when the label is blank. */
export function tabLabel(tabRow: CanvasRow, index: number): string {
  const block = tabRow.effectiveBlock;
  const label = block.type === "tab" ? block.props.label.trim() : "";
  return label.length > 0 ? label : `Tab ${index + 1}`;
}

/** A tab's optional leading glyph (`emoji` or `tabler:IconName`). */
export function tabIcon(tabRow: CanvasRow): string | undefined {
  const block = tabRow.effectiveBlock;
  return block.type === "tab" ? block.props.icon : undefined;
}
