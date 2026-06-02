import type { Block } from "@/lib/schemas/block.ts";

function isBlank(value: string | undefined): boolean {
  return (value ?? "").trim().length === 0;
}

export function isBlockEmpty(block: Block): boolean {
  switch (block.type) {
    case "heading":
      return isBlank(block.props.text);
    case "text":
      return isBlank(block.props.text);
    case "quote":
      return isBlank(block.props.text);
    case "callout":
      return isBlank(block.props.text);
    case "checklistItem":
      return isBlank(block.props.text);
    case "list":
    case "checklist":
      return true;
    case "pageLink":
      return false;
    case "divider":
      return true;
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function isRowEmpty(block: Block, childCount: number): boolean {
  if (block.type === "list" || block.type === "checklist") {
    return childCount === 0;
  }
  return isBlockEmpty(block);
}
