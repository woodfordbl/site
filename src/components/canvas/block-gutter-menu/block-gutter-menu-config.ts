import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

export interface BlockViewOption {
  checked: boolean;
  id: string;
  label: string;
}

export function turnIntoValueFromBlock(block: Block): string | undefined {
  if (block.type === "heading") {
    return `heading-${block.props.level}`;
  }
  if (
    block.type === "text" ||
    block.type === "quote" ||
    block.type === "callout"
  ) {
    return block.type;
  }
  return;
}

export function buildEmbedViewOptions(
  row: CanvasRow
): { items: BlockViewOption[]; label: string } | undefined {
  const block = row.effectiveBlock;
  if (block.type !== "embed" || block.props.url.trim().length === 0) {
    return;
  }

  return {
    label: "Change view",
    items: [
      {
        id: "showTitle",
        label: "Show title",
        checked: block.props.showTitle ?? false,
      },
      {
        id: "showUrl",
        label: "Show URL",
        checked: block.props.showUrl ?? false,
      },
    ],
  };
}

export function canTurnIntoBlock(row: CanvasRow): boolean {
  const { type } = row.effectiveBlock;
  return (
    type === "text" ||
    type === "heading" ||
    type === "quote" ||
    type === "callout"
  );
}
