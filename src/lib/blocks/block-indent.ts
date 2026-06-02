import type { CSSProperties } from "react";

export const MAX_BLOCK_INDENT = 4;
export const BLOCK_INDENT_REM = 1.25;

export function getBlockIndent(block: { indent?: number }): number {
  return clampBlockIndent(block.indent ?? 0);
}

export function clampBlockIndent(indent: number): number {
  return Math.min(MAX_BLOCK_INDENT, Math.max(0, Math.trunc(indent)));
}

export function blockIndentStyle(indent: number): CSSProperties {
  const depth = clampBlockIndent(indent);
  if (depth === 0) {
    return {};
  }
  return { paddingInlineStart: `${depth * BLOCK_INDENT_REM}rem` };
}

export function withBlockIndent<T extends { indent?: number }>(
  block: T,
  indent: number
): T {
  return { ...block, indent: clampBlockIndent(indent) };
}
