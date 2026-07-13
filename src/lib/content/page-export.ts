import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { flattenRows } from "@/lib/blocks/block-tree.ts";
import type { Block } from "@/lib/schemas/block.ts";
import type {
  PageFont,
  PageHeaderImage,
  PageTextScale,
} from "@/lib/schemas/page-settings.ts";

export function exportPageBlocks(rows: CanvasRow[]): Block[] {
  const flat = flattenRows(rows);
  return flat.map((row) => row.effectiveBlock);
}

export function exportPageDocument(
  rows: CanvasRow[],
  meta: {
    font?: PageFont;
    fullWidth?: boolean;
    headerImage?: PageHeaderImage;
    icon?: string;
    id: string;
    parentId: string | null;
    sidebarOrder?: number;
    slug: string;
    textScale?: PageTextScale;
    title: string;
  }
) {
  return {
    id: meta.id,
    slug: meta.slug,
    title: meta.title,
    parentId: meta.parentId,
    ...(meta.icon === undefined ? {} : { icon: meta.icon }),
    ...(meta.font === undefined || meta.font === "default"
      ? {}
      : { font: meta.font }),
    ...(meta.textScale ? { textScale: meta.textScale } : {}),
    ...(meta.fullWidth ? { fullWidth: true } : {}),
    ...(meta.headerImage === undefined
      ? {}
      : { headerImage: meta.headerImage }),
    ...(meta.sidebarOrder === undefined
      ? {}
      : { sidebarOrder: meta.sidebarOrder }),
    blocks: exportPageBlocks(rows),
  };
}
