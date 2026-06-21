import { buildBlockTree, type CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { NormalizeEditablePageBlocksOptions } from "@/lib/blocks/ensure-minimum-blocks.ts";
import { normalizeEditablePageBlocks } from "@/lib/blocks/ensure-minimum-blocks.ts";
import { orderBlocksByIds } from "@/lib/blocks/order-blocks.ts";
import {
  deleteBlockByRowId,
  insertBlockAtPlacement,
  moveBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import type { Block } from "@/lib/schemas/block.ts";

export class CanvasPageSession {
  private readonly blocksById = new Map<string, Block>();
  private blockOrder: string[] = [];
  private rows: CanvasRow[] = [];

  static hydrate(
    blocks: Block[],
    blockOrder?: string[] | null
  ): CanvasPageSession {
    const session = new CanvasPageSession();
    const ordered = orderBlocksByIds(blocks, blockOrder);
    session.syncFromBlocks(ordered);
    return session;
  }

  getBlocks(): Block[] {
    return this.blockOrder
      .map((id) => this.blocksById.get(id))
      .filter((block): block is Block => block != null);
  }

  getBlockOrder(): string[] {
    return [...this.blockOrder];
  }

  getRows(): CanvasRow[] {
    return this.rows;
  }

  updateBlock(rowId: string, block: Block): void {
    if (!this.blocksById.has(rowId)) {
      return;
    }

    this.blocksById.set(rowId, block);
  }

  insertBlock(
    placement: RowPlacement,
    block: Block
  ): { block: Block; flatIndex: number } {
    const blocks = this.getBlocks();
    const nextBlocks = insertBlockAtPlacement(
      blocks,
      this.rows,
      placement,
      block
    );
    const previousIds = new Set(this.blockOrder);
    const inserted = nextBlocks.find((item) => !previousIds.has(item.id));
    const nextBlock = inserted ?? block;

    this.syncFromBlocks(nextBlocks);
    const flatIndex = this.blockOrder.indexOf(nextBlock.id);
    return { block: nextBlock, flatIndex };
  }

  deleteBlock(rowId: string): string[] {
    const nextBlocks = deleteBlockByRowId(this.getBlocks(), this.rows, rowId);
    const nextIds = new Set(nextBlocks.map((block) => block.id));
    const removedIds = this.blockOrder.filter((id) => !nextIds.has(id));
    this.syncFromBlocks(nextBlocks);
    return removedIds;
  }

  moveBlock(rowId: string, placement: RowPlacement): void {
    const nextBlocks = moveBlockByRowId(
      this.getBlocks(),
      this.rows,
      rowId,
      placement
    );
    this.syncFromBlocks(nextBlocks);
  }

  ensureTrailingBlank(options?: NormalizeEditablePageBlocksOptions): {
    changed: boolean;
    inserted?: Block;
  } {
    const result = normalizeEditablePageBlocks(this.getBlocks(), options);
    if (!result.changed) {
      return { changed: false };
    }

    const previousIds = new Set(this.blockOrder);
    this.syncFromBlocks(result.blocks);
    const inserted = result.blocks.find((block) => !previousIds.has(block.id));
    return inserted ? { changed: true, inserted } : { changed: true };
  }

  replaceAllBlocks(blocks: Block[]): void {
    this.syncFromBlocks(blocks);
  }

  private syncFromBlocks(blocks: Block[]): void {
    this.blocksById.clear();
    for (const block of blocks) {
      this.blocksById.set(block.id, block);
    }
    this.blockOrder = blocks.map((block) => block.id);
    this.rows = buildBlockTree(blocks);
  }
}
