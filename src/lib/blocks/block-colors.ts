import type { Block } from "@/lib/schemas/block.ts";
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

/** Combined text + background classes for a block's stored colors. */
export function blockColorClassName(block: Block): string | undefined {
  const textClass = block.color
    ? BLOCK_COLOR_DEFS[block.color].textClass
    : undefined;
  const bgClass = block.backgroundColor
    ? BLOCK_COLOR_DEFS[block.backgroundColor].bgClass
    : undefined;
  if (!(textClass || bgClass)) {
    return;
  }
  return cn(textClass, bgClass);
}
