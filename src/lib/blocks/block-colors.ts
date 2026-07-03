import type { Block, BlockType } from "@/lib/schemas/block.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Block-level color palette. Class strings are literal so Tailwind extracts
 * them; the CSS variables live in `styles.css` with light + dark values.
 */

interface BlockColorDef {
  bgClass: string;
  label: string;
  textClass: string;
}

export const BLOCK_COLOR_DEFS: Record<BlockColor, BlockColorDef> = {
  gray: {
    label: "Gray",
    textClass: "text-(--block-text-gray)",
    bgClass: "bg-(--block-bg-gray)",
  },
  brown: {
    label: "Brown",
    textClass: "text-(--block-text-brown)",
    bgClass: "bg-(--block-bg-brown)",
  },
  orange: {
    label: "Orange",
    textClass: "text-(--block-text-orange)",
    bgClass: "bg-(--block-bg-orange)",
  },
  yellow: {
    label: "Yellow",
    textClass: "text-(--block-text-yellow)",
    bgClass: "bg-(--block-bg-yellow)",
  },
  green: {
    label: "Green",
    textClass: "text-(--block-text-green)",
    bgClass: "bg-(--block-bg-green)",
  },
  blue: {
    label: "Blue",
    textClass: "text-(--block-text-blue)",
    bgClass: "bg-(--block-bg-blue)",
  },
  purple: {
    label: "Purple",
    textClass: "text-(--block-text-purple)",
    bgClass: "bg-(--block-bg-purple)",
  },
  pink: {
    label: "Pink",
    textClass: "text-(--block-text-pink)",
    bgClass: "bg-(--block-bg-pink)",
  },
  red: {
    label: "Red",
    textClass: "text-(--block-text-red)",
    bgClass: "bg-(--block-bg-red)",
  },
};

export const BLOCK_COLOR_IDS = Object.keys(BLOCK_COLOR_DEFS) as BlockColor[];

/** Which color controls a block offers (drives menus and rendering). */
export interface BlockColorCapability {
  background: boolean;
  text: boolean;
}

const NO_COLOR: BlockColorCapability = { text: false, background: false };
const BACKGROUND_ONLY: BlockColorCapability = { text: false, background: true };
const FULL_COLOR: BlockColorCapability = { text: true, background: true };

/**
 * Per-type color limits. Callouts take a background only (the box tint) and own
 * coloring for their children — direct children expose no color controls.
 * Headings carry no formatting at all: no color, no inline marks.
 */
export function resolveBlockColorCapability(
  type: BlockType,
  parentType?: BlockType | null
): BlockColorCapability {
  if (parentType === "callout") {
    return NO_COLOR;
  }
  if (type === "heading" || type === "toggleHeading") {
    return NO_COLOR;
  }
  if (type === "callout") {
    return BACKGROUND_ONLY;
  }
  return FULL_COLOR;
}

/** Background class for a stored color id (e.g. the callout box tint). */
export function blockBackgroundClassName(
  color: BlockColor | undefined
): string | undefined {
  return color ? BLOCK_COLOR_DEFS[color].bgClass : undefined;
}

/**
 * Combined text + background classes for a block's stored colors, honoring the
 * type's capability. Callouts return nothing here — `CalloutView` applies the
 * background to its own box instead of the row shell.
 */
export function blockColorClassName(
  block: Block,
  parentType?: BlockType | null
): string | undefined {
  if (block.type === "callout") {
    return;
  }
  const capability = resolveBlockColorCapability(block.type, parentType);
  const textClass =
    capability.text && block.color
      ? BLOCK_COLOR_DEFS[block.color].textClass
      : undefined;
  const bgClass =
    capability.background && block.backgroundColor
      ? BLOCK_COLOR_DEFS[block.backgroundColor].bgClass
      : undefined;
  if (!(textClass || bgClass)) {
    return;
  }
  return cn(textClass, bgClass);
}
