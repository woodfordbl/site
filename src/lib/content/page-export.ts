import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { flattenRows } from "@/db/queries/merge-blocks.ts";
import type { Block } from "@/lib/schemas/block.ts";

export function exportPageBlocks(rows: CanvasRow[]): Block[] {
  const flat = flattenRows(rows);
  return flat.map((row) => row.effectiveBlock);
}

export function exportPageDocument(
  rows: CanvasRow[],
  meta: { id: string; slug: string; title: string; parentId: string | null }
) {
  return {
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    parentId: meta.parentId,
    blocks: exportPageBlocks(rows),
  };
}
