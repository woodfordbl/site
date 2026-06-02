import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import {
  deleteAllBlocksForPage,
  replacePageBlocks,
  seedPageBlocks,
  upsertPageBlock,
} from "@/db/queries/block-collection-ops.ts";
import {
  buildBlockTree,
  type CanvasRow,
  findRowById,
} from "@/db/queries/merge-blocks.ts";
import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { normalizeEditablePageBlocks } from "@/lib/blocks/ensure-minimum-blocks.ts";
import {
  deleteBlockByRowId,
  insertBlockAtPlacement,
  moveBlockByRowId,
  updateBlockByRowId,
} from "@/lib/blocks/page-block-mutations.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { markPageClean } from "@/lib/local-draft/dirty-pages-cookie.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export interface ServerPageSource {
  blocks: Block[];
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
}

export interface UsePageCanvasOptions {
  focusedBlockId?: string | null;
}

function createId(): string {
  return crypto.randomUUID();
}

function blockIds(blocks: Block[]): string[] {
  return blocks.map((block) => block.id);
}

function applyFocusedDraft(
  blocks: Block[],
  focusedBlockId: string | null,
  focusedDraft: Block | null
): Block[] {
  if (!(focusedBlockId && focusedDraft?.id === focusedBlockId)) {
    return blocks;
  }

  return blocks.map((block) =>
    block.id === focusedBlockId ? focusedDraft : block
  );
}

function existingBlockIds(blocks: Array<{ id: string }>): Set<string> {
  return new Set(blocks.map((block) => block.id));
}

export function usePageCanvas(
  serverPage: ServerPageSource,
  options?: UsePageCanvasOptions
) {
  const { id: pageId } = serverPage;
  const focusedBlockId = options?.focusedBlockId ?? null;

  const {
    blocks: collectionBlocks,
    existingLocalBlocks,
    hasSeededBlocks,
    isReady,
    localPage,
  } = usePageBlocks(pageId);

  const serverBaselineHash = hashPageBlocks(serverPage.blocks);
  const isStale =
    localPage?.serverBaselineHash != null &&
    localPage.serverBaselineHash !== serverBaselineHash;

  const sourceBlocks =
    hasSeededBlocks || localPage != null ? collectionBlocks : serverPage.blocks;

  const [focusedDraft, setFocusedDraft] = useState<Block | null>(null);
  const generatedBlankBlockRef = useRef<{
    block: Extract<Block, { type: "text" }>;
    pageId: string;
  } | null>(null);

  useEffect(() => {
    setFocusedDraft((draft) =>
      draft && draft.id === focusedBlockId ? draft : null
    );
  }, [focusedBlockId]);

  const activeBlocks = useMemo(() => {
    const withDraft = applyFocusedDraft(
      sourceBlocks,
      focusedBlockId,
      focusedDraft
    );
    const sourceIds = existingBlockIds(withDraft);

    return normalizeEditablePageBlocks(withDraft, {
      createBlankBlock: () => {
        const generated = generatedBlankBlockRef.current;
        if (
          generated?.pageId === pageId &&
          !sourceIds.has(generated.block.id)
        ) {
          return generated.block;
        }

        const next = createEmptyBlock("text") as Extract<
          Block,
          { type: "text" }
        >;
        generatedBlankBlockRef.current = { block: next, pageId };
        return next;
      },
    }).blocks;
  }, [focusedBlockId, focusedDraft, pageId, sourceBlocks]);

  const activeBlocksRef = useRef(activeBlocks);
  activeBlocksRef.current = activeBlocks;
  const transactionBlocksRef = useRef<Block[] | null>(null);
  const transactionDeletedIdsRef = useRef<Set<string> | null>(null);

  const getBlocksForMutation = useCallback(
    (): Block[] => transactionBlocksRef.current ?? activeBlocksRef.current,
    []
  );

  const runBlockTransaction = useCallback((run: () => void) => {
    transactionBlocksRef.current = null;
    transactionDeletedIdsRef.current = new Set();
    try {
      run();
    } finally {
      transactionBlocksRef.current = null;
      transactionDeletedIdsRef.current = null;
    }
  }, []);

  const rows = useMemo(() => buildBlockTree(activeBlocks), [activeBlocks]);

  const ensurePageMeta = useCallback(
    (blockOrder?: string[]) => {
      if (localPage) {
        return;
      }

      const timestamp = new Date().toISOString();
      localPagesCollection.insert({
        id: pageId,
        slug: serverPage.slug,
        title: serverPage.title,
        parentId: serverPage.parentId,
        blockOrder,
        serverBaselineHash,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    },
    [
      localPage,
      pageId,
      serverBaselineHash,
      serverPage.parentId,
      serverPage.slug,
      serverPage.title,
    ]
  );

  const persistBlocks = useCallback(
    (blocks: Block[], options?: { singleBlockId?: string }): Block[] => {
      const normalized = normalizeEditablePageBlocks(blocks);
      const nextBlocks = normalized.blocks;

      if (!(hasSeededBlocks || localPage)) {
        ensurePageMeta(blockIds(nextBlocks));
        seedPageBlocks(pageId, nextBlocks);
        return nextBlocks;
      }

      if (!localPage) {
        ensurePageMeta();
      }

      const persistedIds = existingBlockIds(existingLocalBlocks);
      const hasUnpersistedBlocks = nextBlocks.some(
        (block) => !persistedIds.has(block.id)
      );

      if (
        options?.singleBlockId &&
        !(normalized.changed || hasUnpersistedBlocks)
      ) {
        const block = nextBlocks.find(
          (item) => item.id === options.singleBlockId
        );
        if (block) {
          upsertPageBlock(
            pageId,
            block,
            existingLocalBlocks.some((item) => item.id === block.id) &&
              !transactionDeletedIdsRef.current?.has(block.id)
          );
        }
        return nextBlocks;
      }

      replacePageBlocks(pageId, nextBlocks, existingLocalBlocks, {
        deletedInTransaction: transactionDeletedIdsRef.current ?? undefined,
      });
      return nextBlocks;
    },
    [ensurePageMeta, existingLocalBlocks, hasSeededBlocks, localPage, pageId]
  );

  const saveBlocks = useCallback(
    (nextBlocks: Block[]) => {
      transactionBlocksRef.current = persistBlocks(nextBlocks);
    },
    [persistBlocks]
  );

  const saveRowById = useCallback(
    (rowId: string, block: Block) => {
      if (rowId === focusedBlockId) {
        setFocusedDraft(block);
      }

      const seeded = getBlocksForMutation();
      const nextBlocks = updateBlockByRowId(seeded, rowId, block);
      transactionBlocksRef.current = persistBlocks(nextBlocks, {
        singleBlockId: block.id,
      });
    },
    [getBlocksForMutation, focusedBlockId, persistBlocks]
  );

  const insertRowAtPosition = useCallback(
    (position: RowPlacement, block: Block): string => {
      const seeded = getBlocksForMutation();
      const seededRows = buildBlockTree(seeded);
      const nextBlock = block.id ? block : { ...block, id: createId() };
      const nextBlocks = insertBlockAtPlacement(
        seeded,
        seededRows,
        position,
        nextBlock
      );
      transactionBlocksRef.current = nextBlocks;

      saveBlocks(nextBlocks);
      return nextBlock.id;
    },
    [getBlocksForMutation, saveBlocks]
  );

  const deleteRowById = useCallback(
    (rowId: string) => {
      if (rowId === focusedBlockId) {
        setFocusedDraft(null);
      }

      const seeded = getBlocksForMutation();
      const seededRows = buildBlockTree(seeded);
      const nextBlocks = deleteBlockByRowId(seeded, seededRows, rowId);
      transactionBlocksRef.current = nextBlocks;
      saveBlocks(nextBlocks);
    },
    [focusedBlockId, getBlocksForMutation, saveBlocks]
  );

  const moveRowById = useCallback(
    (rowId: string, position: RowPlacement) => {
      const seeded = getBlocksForMutation();
      const seededRows = buildBlockTree(seeded);
      const nextBlocks = moveBlockByRowId(seeded, seededRows, rowId, position);
      transactionBlocksRef.current = nextBlocks;
      saveBlocks(nextBlocks);
    },
    [getBlocksForMutation, saveBlocks]
  );

  const insertRow = useCallback(
    (
      placement: RowPlacement,
      type: BlockType = "text",
      insertOptions?: { indent?: number }
    ): string => {
      const block = createEmptyBlock(type);
      if (insertOptions?.indent !== undefined) {
        block.indent = insertOptions.indent;
      }
      return insertRowAtPosition(placement, block);
    },
    [insertRowAtPosition]
  );

  const saveRow = useCallback(
    (row: CanvasRow, block: Block) => {
      saveRowById(row.rowId, block);
    },
    [saveRowById]
  );

  const getRowById = useCallback(
    (rowId: string) => findRowById(rows, rowId),
    [rows]
  );

  const getPlacementRows = useCallback(() => rows, [rows]);

  const revertToServer = useCallback(() => {
    const now = new Date().toISOString();
    const blocks = serverPage.blocks;

    setFocusedDraft(null);

    if (localPage) {
      localPagesCollection.update(pageId, (draft) => {
        draft.serverBaselineHash = serverBaselineHash;
        draft.updatedAt = now;
      });
    }

    deleteAllBlocksForPage(existingLocalBlocks);
    seedPageBlocks(pageId, blocks);
  }, [
    existingLocalBlocks,
    localPage,
    pageId,
    serverBaselineHash,
    serverPage.blocks,
  ]);

  const acknowledgeServerBaseline = useCallback(() => {
    if (!localPage) {
      return;
    }

    localPagesCollection.update(pageId, (draft) => {
      draft.serverBaselineHash = serverBaselineHash;
      draft.updatedAt = new Date().toISOString();
    });
  }, [localPage, pageId, serverBaselineHash]);

  const resetToServer = useCallback(() => {
    setFocusedDraft(null);

    if (localPage) {
      localPagesCollection.delete(pageId);
    }

    deleteAllBlocksForPage(existingLocalBlocks);
    markPageClean(pageId);
  }, [existingLocalBlocks, localPage, pageId]);

  const hasLocalChanges = localPage != null || hasSeededBlocks;

  return useMemo(
    () => ({
      rows,
      serverBlocks: serverPage.blocks,
      isReady,
      isStale,
      hasLocalChanges,
      saveRow,
      saveRowById,
      insertRow,
      insertRowAtPosition,
      deleteRowById,
      moveRowById,
      getRowById,
      getPlacementRows,
      revertToServer,
      acknowledgeServerBaseline,
      resetToServer,
      runBlockTransaction,
    }),
    [
      rows,
      serverPage.blocks,
      isReady,
      isStale,
      hasLocalChanges,
      saveRow,
      saveRowById,
      insertRow,
      insertRowAtPosition,
      deleteRowById,
      moveRowById,
      getRowById,
      getPlacementRows,
      revertToServer,
      acknowledgeServerBaseline,
      resetToServer,
      runBlockTransaction,
    ]
  );
}
