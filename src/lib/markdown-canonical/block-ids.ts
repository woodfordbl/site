import { hashStableValue } from "@/lib/content/block-hash.ts";

/**
 * Deterministic block ids for parsed markdown. Shipped files carry no ids;
 * parsing mints one from the page id and the block's position in the tree, so
 * re-parsing an unchanged file yields identical ids (stable baselines, clean
 * three-way merges) without any id noise in the markdown itself.
 */

/** Two independent hash passes → 16 hex chars, comfortably collision-free per page. */
export function mintBlockId(
  pageId: string,
  treePath: readonly number[]
): string {
  const forward = hashStableValue([pageId, treePath]);
  const backward = hashStableValue([treePath, pageId, "salt"]);
  return `mdb-${forward}${backward}`;
}
