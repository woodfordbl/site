import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

export function turnIntoValueFromBlock(block: Block): string | undefined {
  if (block.type === "heading") {
    return `heading-${block.props.level}`;
  }
  if (block.type === "toggleHeading") {
    return `toggleHeading-${block.props.level}`;
  }
  if (
    block.type === "text" ||
    block.type === "quote" ||
    block.type === "callout" ||
    block.type === "code"
  ) {
    return block.type;
  }
  return;
}

export function resolveConfiguredEmbedBlock(
  row: CanvasRow
): Extract<Block, { type: "embed" }> | null {
  const block = row.effectiveBlock;
  if (block.type !== "embed" || block.props.url.trim().length === 0) {
    return null;
  }
  return block;
}

export function canTurnIntoBlock(row: CanvasRow): boolean {
  const { type } = row.effectiveBlock;
  return (
    type === "text" ||
    type === "heading" ||
    type === "toggleHeading" ||
    type === "quote" ||
    type === "callout" ||
    type === "code"
  );
}
