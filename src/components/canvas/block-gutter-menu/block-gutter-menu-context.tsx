"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  getBlockSpec,
  getSlashMenuItems,
} from "@/components/blocks/registry.ts";
import { useBlockActionsMenu } from "@/components/canvas/block-actions-menu.tsx";
import {
  buildEmbedViewOptions,
  canTurnIntoBlock,
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
import { measureTableFitTargetWidthPx } from "@/lib/dom/measure-table-fit-width.ts";

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
  const { openRowId } = useBlockActionsMenu();
  const [viewCheckOverrides, setViewCheckOverrides] = useState<
    Record<string, boolean>
  >({});

  const row = rows.find((entry) => entry.rowId === rowId);
  const canTurnInto = row ? canTurnIntoBlock(row) : false;
  const turnIntoValue = row
    ? turnIntoValueFromBlock(row.effectiveBlock)
    : undefined;
  const viewOptions = row ? buildEmbedViewOptions(row) : undefined;

  const defaultViewChecks = useMemo(
    () =>
      Object.fromEntries(
        viewOptions?.items.map((item) => [item.id, item.checked]) ?? []
      ),
    [viewOptions]
  );

  const resolvedViewChecks = viewOptions
    ? { ...defaultViewChecks, ...viewCheckOverrides }
    : viewCheckOverrides;

  const tableBlock =
    row?.effectiveBlock.type === "table" ? row.effectiveBlock : null;
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
    canTurnInto || viewOptions !== undefined || tableBlock !== null;
  const menuOpen = openRowId === rowId;

  const handleViewToggle = useCallback(
    (id: string, checked: boolean) => {
      if (id !== "showTitle" && id !== "showUrl") {
        return;
      }

      const currentRow = rows.find((entry) => entry.rowId === rowId);
      const block = currentRow?.effectiveBlock;
      if (block?.type !== "embed") {
        return;
      }

      setViewCheckOverrides((current) => ({ ...current, [id]: checked }));
      dispatch({
        type: "row.update",
        rowId,
        block: {
          ...block,
          props: {
            ...block.props,
            [id]: checked,
          },
        },
      });
    },
    [dispatch, rowId, rows]
  );

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

  const handleDuplicate = useCallback(() => {
    onDuplicate?.();
  }, [onDuplicate]);

  const handleDelete = useCallback(() => {
    onDelete?.();
  }, [onDelete]);

  const actionItems = useBlockGutterMenuItems({
    canTurnInto,
    handleAddColumn,
    handleAddRow,
    handleDelete,
    handleDuplicate,
    handleFitToWidth,
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    handleTurnInto,
    handleViewToggle,
    lastTableRowId,
    resolvedViewChecks,
    tableBlock,
    turnIntoItems,
    viewOptions,
  });

  const value = useMemo<BlockGutterMenuContextValue>(
    () => ({
      actionItems,
      blockTypeLabel,
      canTurnInto,
      handleAddColumn,
      handleAddRow,
      handleDelete,
      handleDuplicate,
      handleFitToWidth,
      handleToggleHeaderColumn,
      handleToggleHeaderRow,
      handleTurnInto,
      handleViewToggle,
      hasBlockSpecificActions,
      lastTableRowId,
      menuOpen,
      resolvedViewChecks,
      rowId,
      tableBlock,
      tableColumnCount,
      turnIntoItems,
      turnIntoValue,
      viewOptions,
    }),
    [
      actionItems,
      blockTypeLabel,
      canTurnInto,
      handleAddColumn,
      handleAddRow,
      handleDelete,
      handleDuplicate,
      handleFitToWidth,
      handleToggleHeaderColumn,
      handleToggleHeaderRow,
      handleTurnInto,
      handleViewToggle,
      hasBlockSpecificActions,
      lastTableRowId,
      menuOpen,
      resolvedViewChecks,
      rowId,
      tableBlock,
      tableColumnCount,
      turnIntoItems,
      turnIntoValue,
      viewOptions,
    ]
  );

  return (
    <BlockGutterMenuContext.Provider value={value}>
      {children}
    </BlockGutterMenuContext.Provider>
  );
}
