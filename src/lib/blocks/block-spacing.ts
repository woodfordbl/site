import type { BlockType } from "@/lib/schemas/block.ts";
import type { HeadingProps } from "@/lib/schemas/block-props.ts";

/** Shared body copy typography for text-like blocks (one line height by default). */
export const bodyTextClassName =
  "text-lg text-muted-foreground leading-relaxed";

const headingTopSpacingClassNames: Record<HeadingProps["level"], string> = {
  1: "pt-4",
  2: "pt-3",
  3: "pt-2",
  4: "pt-1.5",
};

export function getBlockShellSpacingClass(
  blockType: BlockType,
  headingLevel?: HeadingProps["level"]
): string {
  if (blockType === "heading") {
    return headingLevel ? headingTopSpacingClassNames[headingLevel] : "pt-3";
  }

  if (blockType === "divider") {
    return "flex min-h-10 w-full items-center";
  }

  return "";
}

export const listShellSpacingClass = "group/list";

export const listItemSpacingClass = "pt-px first:pt-0";

/** Fixed-width marker cell — matches ShadCN Checkbox `size-4`. */
export const listMarkerCellClassName =
  "mt-1.5 flex size-4 shrink-0 items-center justify-center";
