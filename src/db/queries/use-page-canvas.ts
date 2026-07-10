import { useCallback, useEffect, useMemo, useRef } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import {
  applyPageBlockDiff,
  beginPageBlockTransaction,
  commitPageBlockTransaction,
  deletePageBlocksInTx,
  insertPageBlockAt,
  type PageBlockTransaction,
  patchBlockOrder,
  seedPageBlocks,
  updatePageBlockInTx,
  upsertPageBlock,
} from "@/db/queries/block-collection-ops.ts";
import { usePageBlocks } from "@/db/queries/use-page-blocks.ts";
import { capturePageBaseline } from "@/db/snapshots/page-baseline-store.ts";
import {
  buildBlockTree,
  type CanvasRow,
  findRowById,
  reconcileRowTrees,
} from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { normalizeEditablePageBlocks } from "@/lib/blocks/ensure-minimum-blocks.ts";
import type { RowPlacement } from "@/lib/blocks/row-placement.ts";
import {
  popPageRedoEntry,
  popPageUndoEntry,
  recordPageEditHistory,
} from "@/lib/canvas/page-edit-history.ts";
import { CanvasPageSession } from "@/lib/canvas/page-session.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { hashPageMetadata } from "@/lib/content/page-metadata-hash.ts";
import { resetPageToRemote } from "@/lib/pages/reset-page-to-remote.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export interface ServerPageSource {
  blocks: Block[];
  icon?: string;
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
}

function createId(): string {
  return crypto.randomUUID();
}

function blockIds(blocks: Block[]): string[] {
  return blocks.map((block) => block.id);
}

function existingBlockIds(blocks: Array<{ id: string }>): Set<string> {
  return new Set(blocks.map((block) => block.id));
}

/**
 * Cheap change check for undo capture: blocks are immutable (every mutation
 * swaps in a new object), so reference + order equality means "unchanged".
 */
function pageBlocksDiffer(before: Block[], after: Block[]): boolean {
  if (before.length !== after.length) {
    return true;
  }
  return before.some((block, index) => block !== after[index]);
}

export function usePageCanvas(
  serverPage: ServerPageSource,
  pageHasLocalDraft = false
) {
  const { id: pageId } = serverPage;

  const {
    blocks: collectionBlocks,
    bootstrapBlocks,
    existingLocalBlocks,
    hasSeededBlocks,
    isReady,
    localPage,
  } = usePageBlocks(pageId);

  const serverBaselineHash = useMemo(
    () => hashPageBlocks(serverPage.blocks),
    [serverPage.blocks]
  );
  const serverMetadataBaseline = useMemo(
    () =>
      hashPageMetadata({
        icon: serverPage.icon,
        parentId: serverPage.parentId,
        slug: serverPage.slug,
        title: serverPage.title,
      }),
    [serverPage.icon, serverPage.parentId, serverPage.slug, serverPage.title]
  );
  const blocksStale =
    localPage?.serverBaselineHash != null &&
    localPage.serverBaselineHash !== serverBaselineHash;
  const metadataStale =
    localPage?.serverMetadataBaseline != null &&
    localPage.serverMetadataBaseline !== serverMetadataBaseline;
  const isStale = blocksStale || metadataStale;

  const hasLocalBlockSource =
    hasSeededBlocks ||
    localPage != null ||
    pageHasLocalDraft ||
    bootstrapBlocks.length > 0;
  const sourceBlocks =
    hasLocalBlockSource &&
    (collectionBlocks.length > 0 || bootstrapBlocks.length > 0)
      ? collectionBlocks
      : serverPage.blocks;

  const generatedBlankBlockRef = useRef<{
    block: Extract<Block, { type: "text" }>;
    pageId: string;
  } | null>(null);

  const sessionRef = useRef<CanvasPageSession | null>(null);
  const collectionTxRef = useRef<PageBlockTransaction | null>(null);
  const inBlockTransactionRef = useRef(false);
  const transactionStartBlocksRef = useRef<Block[] | null>(null);
  // True while a transaction must not record undo history: applying an
  // undo/redo entry, or reverting to the server baseline (whose history is
  // cleared — "cannot be undone" must stay true for Ctrl+Z as well).
  const suppressHistoryCaptureRef = useRef(false);

  const createBlankBlock = useCallback((): Extract<Block, { type: "text" }> => {
    const generated = generatedBlankBlockRef.current;
    const sourceIds = existingBlockIds(
      sessionRef.current?.getBlocks() ?? sourceBlocks
    );
    if (generated?.pageId === pageId && !sourceIds.has(generated.block.id)) {
      return generated.block;
    }

    const next = createEmptyBlock("text") as Extract<Block, { type: "text" }>;
    generatedBlankBlockRef.current = { block: next, pageId };
    return next;
  }, [pageId, sourceBlocks]);

  useEffect(() => {
    if (inBlockTransactionRef.current) {
      return;
    }

    sessionRef.current = CanvasPageSession.hydrate(
      sourceBlocks,
      localPage?.blockOrder
    );
  }, [localPage?.blockOrder, sourceBlocks]);

  const activeBlocks = useMemo(() => {
    const sourceIds = existingBlockIds(sourceBlocks);

    return normalizeEditablePageBlocks(sourceBlocks, {
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
  }, [pageId, sourceBlocks]);

  const activeBlocksRef = useRef(activeBlocks);
  activeBlocksRef.current = activeBlocks;
  const transactionBlocksRef = useRef<Block[] | null>(null);
  const transactionDeletedIdsRef = useRef<Set<string> | null>(null);

  const getSession = useCallback((): CanvasPageSession => {
    if (!sessionRef.current) {
      sessionRef.current = CanvasPageSession.hydrate(
        sourceBlocks,
        localPage?.blockOrder
      );
    }
    return sessionRef.current;
  }, [localPage?.blockOrder, sourceBlocks]);

  const getBlocksForMutation = useCallback((): Block[] => {
    if (transactionBlocksRef.current) {
      return transactionBlocksRef.current;
    }
    if (inBlockTransactionRef.current && sessionRef.current) {
      return sessionRef.current.getBlocks();
    }
    return activeBlocksRef.current;
  }, []);

  const previousRowsRef = useRef<CanvasRow[]>([]);
  const rows = useMemo(() => {
    const reconciled = reconcileRowTrees(
      previousRowsRef.current,
      buildBlockTree(activeBlocks)
    );
    previousRowsRef.current = reconciled;
    return reconciled;
  }, [activeBlocks]);

  const canPersistToCollection = hasSeededBlocks || localPage != null;

  const blockExistsInCollection = useCallback(
    (blockId: string): boolean =>
      existingLocalBlocks.some((item) => item.id === blockId) &&
      !transactionDeletedIdsRef.current?.has(blockId),
    [existingLocalBlocks]
  );

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
        icon: serverPage.icon,
        parentId: serverPage.parentId,
        blockOrder,
        serverBaselineHash,
        serverMetadataBaseline,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      // The seeded shard holds post-edit blocks; the conflict baseline is the
      // pristine server content this overlay diverged from.
      capturePageBaseline(pageId, serverPage.blocks, serverBaselineHash);
    },
    [
      localPage,
      pageId,
      serverBaselineHash,
      serverMetadataBaseline,
      serverPage.blocks,
      serverPage.icon,
      serverPage.parentId,
      serverPage.slug,
      serverPage.title,
    ]
  );

  const persistBlocksOutsideTransaction = useCallback(
    (
      previousBlocks: Block[],
      blocks: Block[],
      options?: { singleBlockId?: string }
    ): Block[] => {
      const normalized = normalizeEditablePageBlocks(blocks, {
        createBlankBlock,
      });
      const nextBlocks = normalized.blocks;

      if (!(hasSeededBlocks || localPage)) {
        ensurePageMeta(blockIds(nextBlocks));
        seedPageBlocks(pageId, nextBlocks);
        getSession().replaceAllBlocks(nextBlocks);
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
            existingLocalBlocks.some((item) => item.id === block.id)
          );
          getSession().updateBlock(block.id, block);
        }
        return nextBlocks;
      }

      applyPageBlockDiff(
        pageId,
        previousBlocks,
        nextBlocks,
        existingLocalBlocks
      );
      getSession().replaceAllBlocks(nextBlocks);
      return nextBlocks;
    },
    [
      createBlankBlock,
      ensurePageMeta,
      existingLocalBlocks,
      getSession,
      hasSeededBlocks,
      localPage,
      pageId,
    ]
  );

  const saveBlocks = useCallback(
    (nextBlocks: Block[]) => {
      const previousBlocks = getBlocksForMutation();
      transactionBlocksRef.current = persistBlocksOutsideTransaction(
        previousBlocks,
        nextBlocks
      );
    },
    [getBlocksForMutation, persistBlocksOutsideTransaction]
  );

  const persistPageBlocks = useCallback(
    (nextBlocks: Block[]) => {
      const session = getSession();
      const previousBlocks =
        transactionStartBlocksRef.current ?? session.getBlocks();

      if (collectionTxRef.current) {
        session.replaceAllBlocks(nextBlocks);
        applyPageBlockDiff(
          pageId,
          previousBlocks,
          nextBlocks,
          existingLocalBlocks,
          {
            deletedInTransaction: transactionDeletedIdsRef.current ?? undefined,
            tx: collectionTxRef.current,
          }
        );
        transactionBlocksRef.current = session.getBlocks();
        return;
      }

      saveBlocks(nextBlocks);
    },
    [existingLocalBlocks, getSession, pageId, saveBlocks]
  );

  const runBlockTransaction = useCallback(
    (run: () => void, options?: { historyCoalesceKey?: string }) => {
      const session = getSession();
      transactionBlocksRef.current = null;
      transactionStartBlocksRef.current = session.getBlocks();
      transactionDeletedIdsRef.current = new Set();
      inBlockTransactionRef.current = true;

      if (canPersistToCollection) {
        collectionTxRef.current = beginPageBlockTransaction(
          pageId,
          session.getBlockOrder(),
          transactionDeletedIdsRef.current
        );
      }

      try {
        run();

        const blankResult = session.ensureTrailingBlank({
          createBlankBlock,
        });
        if (
          blankResult.changed &&
          blankResult.inserted &&
          collectionTxRef.current
        ) {
          const flatIndex = session
            .getBlockOrder()
            .indexOf(blankResult.inserted.id);
          if (flatIndex !== -1) {
            insertPageBlockAt(
              pageId,
              blankResult.inserted,
              flatIndex,
              collectionTxRef.current
            );
          }
        }

        transactionBlocksRef.current = session.getBlocks();
      } finally {
        const pending = transactionBlocksRef.current;
        if (pending && !canPersistToCollection) {
          ensurePageMeta(blockIds(pending));
          seedPageBlocks(pageId, pending);
        } else if (collectionTxRef.current) {
          commitPageBlockTransaction(collectionTxRef.current);
        }

        // Session-long Ctrl+Z: record the pre-transaction state whenever the
        // transaction actually changed blocks (typing bursts coalesce by key).
        const startBlocks = transactionStartBlocksRef.current;
        if (
          !suppressHistoryCaptureRef.current &&
          startBlocks &&
          pageBlocksDiffer(startBlocks, getSession().getBlocks())
        ) {
          recordPageEditHistory(pageId, startBlocks, {
            coalesceKey: options?.historyCoalesceKey,
          });
        }
        suppressHistoryCaptureRef.current = false;

        collectionTxRef.current = null;
        transactionBlocksRef.current = null;
        transactionStartBlocksRef.current = null;
        transactionDeletedIdsRef.current = null;
        inBlockTransactionRef.current = false;
      }
    },
    [
      canPersistToCollection,
      createBlankBlock,
      ensurePageMeta,
      getSession,
      pageId,
    ]
  );

  // Replaces the whole page with a history entry's blocks without recording
  // the replacement itself (the pop already moved state between the stacks).
  const applyEditHistoryBlocks = useCallback(
    (blocks: Block[]) => {
      suppressHistoryCaptureRef.current = true;
      runBlockTransaction(() => {
        persistPageBlocks(blocks);
      });
    },
    [persistPageBlocks, runBlockTransaction]
  );

  const undoEdit = useCallback((): boolean => {
    const entry = popPageUndoEntry(pageId, getSession().getBlocks());
    if (!entry) {
      return false;
    }
    applyEditHistoryBlocks(entry.blocks);
    return true;
  }, [applyEditHistoryBlocks, getSession, pageId]);

  const redoEdit = useCallback((): boolean => {
    const entry = popPageRedoEntry(pageId, getSession().getBlocks());
    if (!entry) {
      return false;
    }
    applyEditHistoryBlocks(entry.blocks);
    return true;
  }, [applyEditHistoryBlocks, getSession, pageId]);

  const saveRowById = useCallback(
    (rowId: string, block: Block) => {
      const session = getSession();
      session.updateBlock(rowId, block);

      if (collectionTxRef.current) {
        updatePageBlockInTx(
          pageId,
          block,
          blockExistsInCollection(block.id),
          collectionTxRef.current
        );
        transactionBlocksRef.current = session.getBlocks();
        return;
      }

      const seeded = getBlocksForMutation();
      transactionBlocksRef.current = persistBlocksOutsideTransaction(
        seeded,
        session.getBlocks(),
        { singleBlockId: block.id }
      );
    },
    [
      blockExistsInCollection,
      getBlocksForMutation,
      getSession,
      pageId,
      persistBlocksOutsideTransaction,
    ]
  );

  const insertRowAtPosition = useCallback(
    (position: RowPlacement, block: Block): string => {
      const session = getSession();
      const nextBlock = block.id ? block : { ...block, id: createId() };
      const { block: inserted, flatIndex } = session.insertBlock(
        position,
        nextBlock
      );

      if (collectionTxRef.current && flatIndex !== -1) {
        insertPageBlockAt(pageId, inserted, flatIndex, collectionTxRef.current);
      }

      transactionBlocksRef.current = session.getBlocks();
      return inserted.id;
    },
    [getSession, pageId]
  );

  const deleteRowById = useCallback(
    (rowId: string) => {
      const session = getSession();
      const removedIds = session.deleteBlock(rowId);

      if (collectionTxRef.current && removedIds.length > 0) {
        deletePageBlocksInTx(pageId, removedIds, collectionTxRef.current);
      }

      transactionBlocksRef.current = session.getBlocks();
    },
    [getSession, pageId]
  );

  const moveRowById = useCallback(
    (rowId: string, position: RowPlacement) => {
      const session = getSession();
      session.moveBlock(rowId, position);

      if (collectionTxRef.current) {
        patchBlockOrder(
          pageId,
          session.getBlockOrder(),
          collectionTxRef.current
        );
        const moved = session.getBlocks().find((block) => block.id === rowId);
        if (moved) {
          updatePageBlockInTx(
            pageId,
            moved,
            blockExistsInCollection(rowId),
            collectionTxRef.current
          );
        }
      }

      transactionBlocksRef.current = session.getBlocks();
    },
    [blockExistsInCollection, getSession, pageId]
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

  const getPlacementRows = useCallback(() => {
    // Prefer the live session tree so structural reads stay correct between
    // back-to-back dispatches (React `rows` can lag until the collection syncs).
    if (sessionRef.current) {
      return sessionRef.current.getRows();
    }
    return rows;
  }, [rows]);

  const revertToServer = useCallback(() => {
    // resetPageToRemote clears the page's undo history; keep the enclosing
    // transaction from re-recording the pre-revert state.
    if (inBlockTransactionRef.current) {
      suppressHistoryCaptureRef.current = true;
    }
    resetPageToRemote(pageId);
    sessionRef.current = CanvasPageSession.hydrate(serverPage.blocks);
  }, [pageId, serverPage.blocks]);

  const acknowledgeServerBaseline = useCallback(() => {
    if (!localPage) {
      return;
    }

    localPagesCollection.update(pageId, (draft) => {
      draft.serverBaselineHash = serverBaselineHash;
      draft.serverMetadataBaseline = serverMetadataBaseline;
      draft.updatedAt = new Date().toISOString();
    });
  }, [localPage, pageId, serverBaselineHash, serverMetadataBaseline]);

  const resetToServer = useCallback(() => {
    if (inBlockTransactionRef.current) {
      suppressHistoryCaptureRef.current = true;
    }
    resetPageToRemote(pageId);
    sessionRef.current = CanvasPageSession.hydrate(serverPage.blocks);
  }, [pageId, serverPage.blocks]);

  const hasLocalChanges = localPage != null || hasSeededBlocks;

  return useMemo(
    () => ({
      rows,
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
      persistPageBlocks,
      runBlockTransaction,
      undoEdit,
      redoEdit,
    }),
    [
      rows,
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
      persistPageBlocks,
      runBlockTransaction,
      undoEdit,
      redoEdit,
    ]
  );
}
