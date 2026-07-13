import type { Heading, RootContent } from "mdast";

import type { Block } from "@/lib/schemas/block.ts";

import { type PageFrontmatter, parsePageFrontmatter } from "./frontmatter.ts";
import { phrasingToMarks } from "./inline-marks.ts";
import { mdastToBlocks } from "./mdast-to-blocks.ts";
import type { PageLinkContext } from "./page-link-context.ts";
import { parseMarkdownToTree } from "./processor.ts";

/**
 * Canonical page markdown → `{ frontmatter, blocks }`. Strict parses require
 * the frontmatter fence; `lenient` accepts foreign markdown (no frontmatter,
 * first H1 → title, leading emoji → icon) for the import flow.
 */

export interface ParsePageOptions {
  /** Accept frontmatter-less foreign markdown (import flow). */
  lenient?: boolean;
  /** Injected page-link resolution (absent → `page:` URIs round-trip as-is). */
  linkContext?: PageLinkContext;
  /** Overrides the id used for deterministic block minting (imports). */
  pageId?: string;
}

export interface ParsedPageMarkdown {
  blocks: Block[];
  frontmatter: PageFrontmatter | null;
  /** Lenient-mode page icon lifted from a leading emoji in the H1 title. */
  icon?: string;
  /** Lenient-mode title from the first H1 (frontmatter wins when present). */
  title?: string;
}

const LEADING_EMOJI_RE =
  /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*)\s+/u;

function extractLenientTitle(nodes: RootContent[]): {
  icon?: string;
  nodes: RootContent[];
  title?: string;
} {
  const first = nodes[0];
  if (first?.type !== "heading" || (first as Heading).depth !== 1) {
    return { nodes };
  }
  const raw = phrasingToMarks((first as Heading).children).text.trim();
  const emoji = LEADING_EMOJI_RE.exec(raw);
  return {
    title: emoji ? raw.slice(emoji[0].length) : raw,
    ...(emoji?.[1] === undefined ? {} : { icon: emoji[1] }),
    nodes: nodes.slice(1),
  };
}

/**
 * Body-only parse: blocks from markdown with no frontmatter handling and no
 * H1 title lift (database row templates, clipboard paste).
 */
export function parseBlocksMarkdown(
  raw: string,
  options: Pick<ParsePageOptions, "linkContext" | "pageId"> = {}
): Block[] {
  const tree = parseMarkdownToTree(raw);
  return mdastToBlocks(tree.children, {
    ctx: options.linkContext ?? {},
    pageId: options.pageId ?? "body",
  });
}

export function parsePageMarkdown(
  raw: string,
  options: ParsePageOptions = {}
): ParsedPageMarkdown {
  const tree = parseMarkdownToTree(raw);
  let nodes: RootContent[] = tree.children;

  let frontmatter: PageFrontmatter | null = null;
  const first = nodes[0];
  if (first?.type === "yaml") {
    frontmatter = parsePageFrontmatter(first.value);
    nodes = nodes.slice(1);
  } else if (!options.lenient) {
    throw new Error("Page markdown is missing its frontmatter fence");
  }

  let title: string | undefined;
  let icon: string | undefined;
  if (!frontmatter && options.lenient) {
    const extracted = extractLenientTitle(nodes);
    nodes = extracted.nodes;
    title = extracted.title;
    icon = extracted.icon;
  }

  const pageId = options.pageId ?? frontmatter?.id ?? "imported";
  const blocks = mdastToBlocks(nodes, {
    ctx: options.linkContext ?? {},
    pageId,
  });

  return {
    blocks,
    frontmatter,
    ...(title === undefined ? {} : { title }),
    ...(icon === undefined ? {} : { icon }),
  };
}
