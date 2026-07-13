import type { Root } from "mdast";

import type { Block } from "@/lib/schemas/block.ts";

import { blocksToMdastChildren } from "./blocks-to-mdast.ts";
import { type PageFrontmatter, printPageFrontmatter } from "./frontmatter.ts";
import type { PageLinkContext } from "./page-link-context.ts";
import { stringifyTree } from "./processor.ts";

/**
 * Blocks + frontmatter → canonical page markdown. The output is a normal
 * form: fixed frontmatter key order, defaults omitted, blank rows dropped,
 * one trailing newline — `serialize(parse(serialize(x))) === serialize(x)`.
 */
export function serializePageMarkdown(
  blocks: readonly Block[],
  frontmatter: PageFrontmatter,
  ctx: PageLinkContext = {}
): string {
  const root: Root = {
    type: "root",
    children: [
      { type: "yaml", value: printPageFrontmatter(frontmatter) },
      ...blocksToMdastChildren(blocks, ctx),
    ],
  };
  const output = stringifyTree(root);
  return output.endsWith("\n") ? output : `${output}\n`;
}

/** Body-only serialization (clipboard copy, raw-mode preview). */
export function serializeBlocksMarkdown(
  blocks: readonly Block[],
  ctx: PageLinkContext = {}
): string {
  const root: Root = {
    type: "root",
    children: blocksToMdastChildren(blocks, ctx),
  };
  const output = stringifyTree(root);
  return output.endsWith("\n") ? output : `${output}\n`;
}
