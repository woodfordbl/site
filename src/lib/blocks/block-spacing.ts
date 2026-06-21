import { headingTypographyClassNames } from "@/lib/blocks/heading-typography.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { HeadingProps } from "@/lib/schemas/block-props.ts";
import { cn } from "@/lib/utils.ts";

const canvasGutterFirstLinePaddingClassNames = {
  body: "pt-[calc(0.5lh-0.75rem)]",
  callout: "pt-[calc(0.5rem+0.5lh-0.75rem)]",
  heading1: "pt-[calc(0.5lh-0.75rem)]",
  heading2: "pt-[calc(0.5lh-0.75rem)]",
  heading3: "pt-[calc(0.5lh-0.75rem)]",
  heading4: "pt-[calc(0.5lh-0.75rem)]",
} as const;

/** Shared body copy typography for text-like blocks (one line height by default). */
export const bodyTextTypographyClassName = "text-lg leading-relaxed";

export const bodyTextClassName = `${bodyTextTypographyClassName} text-muted-foreground`;

const headingTopSpacingClassNames: Record<HeadingProps["level"], string> = {
  1: "pt-4",
  2: "pt-3",
  3: "pt-2",
  4: "pt-1.5",
};

const canvasGutterHeadingFirstLineClassNames: Record<
  HeadingProps["level"],
  string
> = {
  1: cn(
    headingTypographyClassNames[1],
    canvasGutterFirstLinePaddingClassNames.heading1
  ),
  2: cn(
    headingTypographyClassNames[2],
    canvasGutterFirstLinePaddingClassNames.heading2
  ),
  3: cn(
    headingTypographyClassNames[3],
    canvasGutterFirstLinePaddingClassNames.heading3
  ),
  4: cn(
    headingTypographyClassNames[4],
    canvasGutterFirstLinePaddingClassNames.heading4
  ),
};

/** `icon-xs` gutter controls aligned to the first line of {@link bodyTextTypographyClassName}. */
export const canvasGutterBodyFirstLineClassName = cn(
  bodyTextTypographyClassName,
  canvasGutterFirstLinePaddingClassNames.body
);

/** Gutter alignment for `pageLink` rows (`Button` size `lg` / `h-9`). */
export const canvasGutterPageLinkFirstLineClassName = "h-9 items-center";

/** Gutter alignment for padded callout rows (`py-2` + body first line). */
export const canvasGutterCalloutFirstLineClassName = cn(
  bodyTextTypographyClassName,
  canvasGutterFirstLinePaddingClassNames.callout
);

export function getCanvasGutterAlignClassName(block: Block): string {
  if (block.type === "pageLink") {
    return canvasGutterPageLinkFirstLineClassName;
  }

  if (block.type === "callout") {
    return canvasGutterCalloutFirstLineClassName;
  }

  if (block.type === "heading") {
    return canvasGutterHeadingFirstLineClassNames[block.props.level];
  }

  if (block.type === "divider") {
    return "";
  }

  return canvasGutterBodyFirstLineClassName;
}

/** Edit fields in lists/checklists: foreground text, muted placeholder via EditableSurface. */
export const canvasEditTextClassName = `${bodyTextTypographyClassName} text-foreground`;

export function getBlockShellSpacingClass(
  blockType: Block["type"],
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
