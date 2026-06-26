import { countPageWords } from "@/lib/pages/page-word-count.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

export interface PageActivitySummary {
  blockCount: number;
  createdAt: string | null;
  lastEditedAt: string | null;
  wordCount: number;
}

function maxIsoTimestamp(
  left: string | null,
  right: string | null
): string | null {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return left.localeCompare(right) >= 0 ? left : right;
}

/**
 * Aggregates page activity summary from local metadata and block timestamps.
 */
export function buildPageActivitySummary(options: {
  blocks: Block[];
  localBlocks?: LocalBlock[];
  localPage: LocalPage | null;
}): PageActivitySummary {
  const { blocks, localBlocks = [], localPage } = options;

  let lastEditedAt = localPage?.updatedAt ?? null;
  for (const block of localBlocks) {
    lastEditedAt = maxIsoTimestamp(lastEditedAt, block.updatedAt);
  }

  return {
    blockCount: blocks.length,
    createdAt: localPage?.createdAt ?? null,
    lastEditedAt,
    wordCount: countPageWords(blocks),
  };
}
