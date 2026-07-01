"use client";

import { createContext, useCallback, useContext, useMemo } from "react";

import {
  getBlockSpec,
  getSlashMenuItems,
} from "@/components/blocks/registry.ts";
import { useBlockActionsMenu } from "@/components/canvas/block-actions-menu.tsx";
import {
  canTurnIntoBlock,
  resolveConfiguredEmbedBlock,
  turnIntoValueFromBlock,
} from "@/components/canvas/block-gutter-menu/block-gutter-menu-config.ts";
import type {
  BlockGutterMenuContextValue,
  BlockGutterMenuProviderProps,
} from "@/components/canvas/block-gutter-menu/block-gutter-menu-types.ts";
import { useBlockGutterMenuItems } from "@/components/canvas/block-gutter-menu/use-block-gutter-menu-items.tsx";
import {
  useCanvasEditorContext,
  useCanvasEditorState,
} from "@/components/canvas/canvas-editor-context.tsx";
import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";
import { measureTableFitTargetWidthPx } from "@/lib/dom/measure-table-fit-width.ts";
import {
  copyEmbedLink,
  openEmbedInBrowser,
} from "@/lib/media/embed-actions.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

export type {
  BlockGutterMenuContextValue,
  BlockGutterMenuProps,
  BlockGutterMenuProviderProps,
} from "@/components/canvas/block-gutter-menu/block-gutter-menu-types.ts";

const BlockGutterMenuContext =
  createContext<BlockGutterMenuContextValue | null>(null);

export function useBlockGutterMenu(): BlockGutterMenuContextValue {
  const context = useContext(BlockGutterMenuContext);
  if (!context) {
    throw new Error(
      "useBlockGutterMenu must be used within BlockGutterMenuProvider."
    );
  }
  return context;
}

export function BlockGutterMenuProvider({
  children,
  onConvert,
  onDelete,
  onDuplicate,
  rowId,
}: BlockGutterMenuProviderProps) {
  const { dispatch } = useCanvasEditorContext();
  const { rows } = useCanvasEditorState();
  const { closeBlockActionsMenu, openRowId } = useBlockActionsMenu();

  const row = rows.find((entry) => entry.rowId === rowId);
  const effectiveBlockId = row?.effectiveBlock.id;
  const canTurnInto = row ? canTurnIntoBlock(row) : false;
  const turnIntoValue = row
    ? turnIntoValueFromBlock(row.effectiveBlock)
    : undefined;
  const embedBlock = row ? resolveConfiguredEmbedBlock(row) : null;

  const tableBlock =
    row?.effectiveBlock.type === "table" ? row.effectiveBlock : null;
  const calloutBlock =
    row?.effectiveBlock.type === "callout" ? row.effectiveBlock : null;
  const lastTableRowId = row?.children.at(-1)?.rowId;
  const tableColumnCount = row?.children[0]?.children.length ?? 0;

  const turnIntoItems = getSlashMenuItems();
  const currentTurnIntoLabel = turnIntoItems.find(
    (item) => item.key === turnIntoValue
  )?.label;
  const blockTypeLabel =
    currentTurnIntoLabel ??
    (row ? getBlockSpec(row.effectiveBlock.type).label : undefined);
  const hasBlockSpecificActions =
    canTurnInto || embedBlock !== null || tableBlock !== null;
  const menuOpen = openRowId === rowId;

  const runAfterMenuClose = useCallback(
    (action: () => void) => {
      closeBlockActionsMenu();
      queueMicrotask(action);
    },
    [closeBlockActionsMenu]
  );

  const handleEmbedReplace = useCallback(() => {
    runAfterMenuClose(() => {
      dispatch({
        type: "focus.set",
        rowId,
        embedAction: "replace",
      });
    });
  }, [dispatch, rowId, runAfterMenuClose]);

  const handleEmbedToggleCaption = useCallback(
    (enabled: boolean) => {
      const currentRow = rows.find((entry) => entry.rowId === rowId);
      const block = currentRow?.effectiveBlock;
      if (block?.type !== "embed") {
        return;
      }

      dispatch({
        type: "row.update",
        rowId,
        block: {
          ...block,
          props: {
            ...block.props,
            showCaption: enabled,
          },
        },
      });

      if (enabled) {
        runAfterMenuClose(() => {
          dispatch({
            type: "focus.set",
            rowId,
            embedAction: "caption",
          });
        });
      }
    },
    [dispatch, rowId, rows, runAfterMenuClose]
  );

  const handleEmbedOpenInBrowser = useCallback(() => {
    if (!embedBlock) {
      return;
    }
    openEmbedInBrowser(embedBlock.props.url);
  }, [embedBlock]);

  const handleEmbedCopyLink = useCallback(() => {
    if (!embedBlock) {
      return;
    }
    copyEmbedLink(embedBlock.props.url).catch(() => undefined);
  }, [embedBlock]);

  const handleTurnInto = useCallback(
    (key: string) => {
      if (key === turnIntoValue) {
        return;
      }
      const item = turnIntoItems.find(
        (turnIntoItem) => turnIntoItem.key === key
      );
      if (!item) {
        return;
      }
      onConvert?.(item);
    },
    [onConvert, turnIntoItems, turnIntoValue]
  );

  const handleFitToWidth = useCallback(() => {
    if (!tableBlock) {
      return;
    }
    const targetWidthPx = measureTableFitTargetWidthPx(tableBlock.id);
    if (targetWidthPx === null) {
      return;
    }
    dispatch({
      type: "table.fitToWidth",
      tableId: tableBlock.id,
      targetWidthPx,
    });
  }, [dispatch, tableBlock]);

  const handleToggleHeaderRow = useCallback(
    (enabled: boolean) => {
      if (!tableBlock) {
        return;
      }
      dispatch({
        type: "table.toggleHeaderRow",
        tableId: tableBlock.id,
        enabled,
      });
    },
    [dispatch, tableBlock]
  );

  const handleToggleHeaderColumn = useCallback(
    (enabled: boolean) => {
      if (!tableBlock) {
        return;
      }
      dispatch({
        type: "table.toggleHeaderColumn",
        tableId: tableBlock.id,
        enabled,
      });
    },
    [dispatch, tableBlock]
  );

  const handleAddRow = useCallback(() => {
    if (!lastTableRowId) {
      return;
    }
    dispatch({
      type: "table.addRow",
      tableRowId: lastTableRowId,
      edge: "after",
    });
  }, [dispatch, lastTableRowId]);

  const handleAddColumn = useCallback(() => {
    if (!tableBlock) {
      return;
    }
    dispatch({
      type: "table.addColumn",
      tableId: tableBlock.id,
      columnIndex: Math.max(0, tableColumnCount - 1),
      edge: "after",
    });
  }, [dispatch, tableBlock, tableColumnCount]);

  const setCalloutIcon = useCallback(
    (icon: string | undefined) => {
      const currentRow = rows.find((entry) => entry.rowId === rowId);
      const block = currentRow?.effectiveBlock;
      if (block?.type !== "callout") {
        return;
      }
      dispatch({
        type: "row.update",
        rowId,
        block: { ...block, props: { ...block.props, icon } },
      });
    },
    [dispatch, rowId, rows]
  );

  const handleAddCalloutIcon = useCallback(() => {
    setCalloutIcon(DEFAULT_CALLOUT_ICON);
  }, [setCalloutIcon]);

  const handleRemoveCalloutIcon = useCallback(() => {
    setCalloutIcon(undefined);
  }, [setCalloutIcon]);

  const supportsBlockColor = row !== undefined;
  const blockColor = row?.effectiveBlock.color;
  const blockBackgroundColor = row?.effectiveBlock.backgroundColor;

  const handleSetBlockColor = useCallback(
    (color: BlockColor | undefined) => {
      const block = rows.find((entry) => entry.rowId === rowId)?.effectiveBlock;
      if (!block) {
        return;
      }
      dispatch({ type: "row.update", rowId, block: { ...block, color } });
    },
    [dispatch, rowId, rows]
  );

  const handleSetBlockBackground = useCallback(
    (color: BlockColor | undefined) => {
      const block = rows.find((entry) => entry.rowId === rowId)?.effectiveBlock;
      if (!block) {
        return;
      }
      dispatch({
        type: "row.update",
        rowId,
        block: { ...block, backgroundColor: color },
      });
    },
    [dispatch, rowId, rows]
  );

  const handleDuplicate = useCallback(() => {
    onDuplicate?.();
  }, [onDuplicate]);

  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  const actionItems = useBlockGutterMenuItems({
    blockBackgroundColor,
    blockColor,
    calloutBlock,
    canTurnInto,
    embedBlock,
    handleAddCalloutIcon,
    handleRemoveCalloutIcon,
    handleAddColumn,
    handleAddRow,
    handleDelete,
    handleDuplicate,
    handleEmbedCopyLink,
    handleEmbedOpenInBrowser,
    handleEmbedReplace,
    handleEmbedToggleCaption,
    handleFitToWidth,
    handleSetBlockBackground,
    handleSetBlockColor,
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    handleTurnInto,
    lastTableRowId,
    supportsBlockColor,
    tableBlock,
    turnIntoItems,
  });

  const value = useMemo<BlockGutterMenuContextValue>(
    () => ({
      actionItems,
      blockBackgroundColor,
      blockColor,
      blockTypeLabel,
      calloutBlock,
      canTurnInto,
      effectiveBlockId,
      embedBlock,
      handleAddCalloutIcon,
      handleRemoveCalloutIcon,
      handleAddColumn,
      handleAddRow,
      handleDelete,
      handleDuplicate,
      handleEmbedCopyLink,
      handleEmbedOpenInBrowser,
      handleEmbedReplace,
      handleEmbedToggleCaption,
      handleFitToWidth,
      handleSetBlockBackground,
      handleSetBlockColor,
      handleToggleHeaderColumn,
      handleToggleHeaderRow,
      handleTurnInto,
      hasBlockSpecificActions,
      lastTableRowId,
      menuOpen,
      rowId,
      supportsBlockColor,
      tableBlock,
      tableColumnCount,
      turnIntoItems,
      turnIntoValue,
    }),
    [
      actionItems,
      blockBackgroundColor,
      blockColor,
      blockTypeLabel,
      calloutBlock,
      canTurnInto,
      effectiveBlockId,
      embedBlock,
      handleAddCalloutIcon,
      handleRemoveCalloutIcon,
      handleAddColumn,
      handleAddRow,
      handleDelete,
      handleDuplicate,
      handleEmbedCopyLink,
      handleEmbedOpenInBrowser,
      handleEmbedReplace,
      handleEmbedToggleCaption,
      handleFitToWidth,
      handleSetBlockBackground,
      handleSetBlockColor,
      handleToggleHeaderColumn,
      handleToggleHeaderRow,
      handleTurnInto,
      hasBlockSpecificActions,
      lastTableRowId,
      menuOpen,
      rowId,
      supportsBlockColor,
      tableBlock,
      tableColumnCount,
      turnIntoItems,
      turnIntoValue,
    ]
  );

  return (
    <BlockGutterMenuContext.Provider value={value}>
      {children}
    </BlockGutterMenuContext.Provider>
  );
}
