import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { flattenRows } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";

export function exportPageBlocks(rows: CanvasRow[]): Block[] {
  const flat = flattenRows(rows);
  return flat.map((row) => row.effectiveBlock);
}

export function exportPageDocument(
  rows: CanvasRow[],
  meta: {
    id: string;
    slug: string;
    title: string;
    parentId: string | null;
    icon?: string;
  }
) {
  return {
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    parentId: meta.parentId,
    ...(meta.icon === undefined ? {} : { icon: meta.icon }),
    blocks: exportPageBlocks(rows),
  };
}
