import { useCallback, useMemo } from "react";

import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import {
  resolveRowPlacementPlan,
  resolveScopeStartPlacement,
} from "@/lib/blocks/row-placement.ts";
import type { CanvasCommand } from "@/lib/canvas/commands.ts";
import type { Block, BlockType } from "@/lib/schemas/block.ts";

export interface RowInsertOptions {
  blockType?: BlockType;
  indent?: number;
  initialText?: string;
  pageId?: string;
  pageLinkVariant?: "linked" | "child";
}

interface UseCanvasRowActionsOptions {
  dispatch: (command: CanvasCommand) => void;
  getPlacementRows: () => CanvasRow[];
}

export function useCanvasRowActions({
  getPlacementRows,
  dispatch,
}: UseCanvasRowActionsOptions) {
  const insertAt = useCallback(
    (
      targetRowId: string,
      edge: "before" | "after",
      options?: RowInsertOptions
    ) => {
      const plan = resolveRowPlacementPlan(
        getPlacementRows(),
        targetRowId,
        edge
      );
      if (!plan) {
        return;
      }

      dispatch({
        type: "row.insert",
        position: plan,
        blockType: options?.blockType,
        indent: options?.indent,
        initialText: options?.initialText,
        pageId: options?.pageId,
        pageLinkVariant: options?.pageLinkVariant,
      });
    },
    [dispatch, getPlacementRows]
  );

  const insertAfter = useCallback(
    (targetRowId: string, options?: RowInsertOptions) => {
      insertAt(targetRowId, "after", options);
    },
    [insertAt]
  );

  const insertBefore = useCallback(
    (targetRowId: string, options?: RowInsertOptions) => {
      insertAt(targetRowId, "before", options);
    },
    [insertAt]
  );

  const insertAtScopeStart = useCallback(
    (parentId: string | null, options?: RowInsertOptions) => {
      const plan = resolveScopeStartPlacement(getPlacementRows(), parentId);
      dispatch({
        type: "row.insert",
        position: plan,
        blockType: options?.blockType,
        indent: options?.indent,
        initialText: options?.initialText,
      });
    },
    [dispatch, getPlacementRows]
  );

  const moveAt = useCallback(
    (sourceRowId: string, targetRowId: string, edge: "before" | "after") => {
      dispatch({
        type: "row.move",
        rowId: sourceRowId,
        targetRowId,
        edge,
      });
    },
    [dispatch]
  );

  const moveAfter = useCallback(
    (sourceRowId: string, targetRowId: string) => {
      moveAt(sourceRowId, targetRowId, "after");
    },
    [moveAt]
  );

  const moveBefore = useCallback(
    (sourceRowId: string, targetRowId: string) => {
      moveAt(sourceRowId, targetRowId, "before");
    },
    [moveAt]
  );

  const pasteAt = useCallback(
    (
      targetRowId: string,
      blocks: Block[],
      edge: "before" | "after" = "after"
    ) => {
      if (blocks.length === 0) {
        return;
      }

      dispatch({
        type: "rows.paste",
        targetRowId,
        blocks,
        edge,
      });
    },
    [dispatch]
  );

  const pasteAfter = useCallback(
    (targetRowId: string, blocks: Block[]) => {
      pasteAt(targetRowId, blocks, "after");
    },
    [pasteAt]
  );

  const pasteBefore = useCallback(
    (targetRowId: string, blocks: Block[]) => {
      pasteAt(targetRowId, blocks, "before");
    },
    [pasteAt]
  );

  return useMemo(
    () => ({
      insertAfter,
      insertBefore,
      insertAtScopeStart,
      moveAfter,
      moveBefore,
      pasteAfter,
      pasteBefore,
    }),
    [
      insertAfter,
      insertAtScopeStart,
      insertBefore,
      moveAfter,
      moveBefore,
      pasteAfter,
      pasteBefore,
    ]
  );
}
