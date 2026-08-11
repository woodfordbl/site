import { countPageWords } from "@/lib/pages/page-word-count.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type { LocalBlock } from "@/lib/schemas/local-block.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/**
 * Authored timestamps from shipped content, structurally satisfied by both
 * `Page` and `PageSummary`.
 */
export interface PageActivityServerTimestamps {
  createdAt?: string;
  updatedAt?: string;
}

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
 * Newest edit across page metadata, per-block timestamps, and the shipped
 * document. Shipped pages have no local rows until their first local edit, so
 * the authored `updatedAt` is the only timestamp available until then.
 */
export function resolvePageLastEditedAt(options: {
  localBlocks?: LocalBlock[];
  localPage: LocalPage | null;
  serverPage?: PageActivityServerTimestamps | null;
}): string | null {
  const { localBlocks = [], localPage, serverPage } = options;

  let lastEditedAt = maxIsoTimestamp(
    localPage?.updatedAt ?? null,
    serverPage?.updatedAt ?? null
  );
  for (const block of localBlocks) {
    lastEditedAt = maxIsoTimestamp(lastEditedAt, block.updatedAt);
  }

  return lastEditedAt;
}

/**
 * Aggregates page activity summary from local metadata and block timestamps,
 * falling back to shipped timestamps for pages with no local edits. The
 * authored `createdAt` wins over the local one, which is stamped at lazy-seed
 * time rather than when the page was actually created.
 */
export function buildPageActivitySummary(options: {
  blocks: Block[];
  localBlocks?: LocalBlock[];
  localPage: LocalPage | null;
  serverPage?: PageActivityServerTimestamps | null;
}): PageActivitySummary {
  const { blocks, localBlocks = [], localPage, serverPage } = options;

  return {
    blockCount: blocks.length,
    createdAt: serverPage?.createdAt ?? localPage?.createdAt ?? null,
    lastEditedAt: resolvePageLastEditedAt({
      localBlocks,
      localPage,
      serverPage,
    }),
    wordCount: countPageWords(blocks),
  };
}
