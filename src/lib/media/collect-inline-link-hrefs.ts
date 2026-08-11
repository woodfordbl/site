import { getBlockMarks } from "@/lib/blocks/rich-text.ts";
import type { Block } from "@/lib/schemas/block.ts";

/**
 * Unique external link hrefs from rich-text `link` marks on a page's blocks.
 * Skips inline page links (`pageId`) — those navigate in-app and have no OG
 * preview. Used to idle-preload OG previews for the open canvas only.
 */
export function collectInlineLinkHrefs(blocks: readonly Block[]): string[] {
  const seen = new Set<string>();
  const hrefs: string[] = [];
  for (const block of blocks) {
    for (const mark of getBlockMarks(block)) {
      if (mark.type !== "link" || mark.pageId) {
        continue;
      }
      const href = mark.href?.trim();
      if (!href || seen.has(href)) {
        continue;
      }
      seen.add(href);
      hrefs.push(href);
    }
  }
  return hrefs;
}
