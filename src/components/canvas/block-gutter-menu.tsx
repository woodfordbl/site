import {
  IconArrowsHorizontal,
  IconColumnInsertRight,
  IconCopy,
  IconExchange,
  IconRowInsertBottom,
  IconTableColumn,
  IconTableRow,
  IconTrash,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import {
  getBlockSpec,
  getSlashMenuItems,
} from "@/components/blocks/registry.ts";
import { ActionMenuSearchSection } from "@/components/canvas/action-menu-search.tsx";
import { useBlockActionsMenu } from "@/components/canvas/block-actions-menu.tsx";
import {
  useCanvasEditorContext,
  useCanvasEditorState,
} from "@/components/canvas/canvas-editor-context.tsx";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
} from "@/components/ui/dropdown-menu.tsx";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";
import { measureTableFitTargetWidthPx } from "@/lib/dom/measure-table-fit-width.ts";

export interface BlockViewOption {
  checked: boolean;
  id: string;
  label: string;
}

interface BlockGutterMenuProps {
  canTurnInto: boolean;
  onConvert?: (item: SlashMenuItem) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  rowId: string;
  turnIntoValue?: string;
  viewOptions?: {
    items: BlockViewOption[];
    label: string;
  };
}

export function BlockGutterMenu({
  canTurnInto,
  onConvert,
  onDelete,
  onDuplicate,
  rowId,
  turnIntoValue,
  viewOptions,
}: BlockGutterMenuProps) {
  const { dispatch } = useCanvasEditorContext();
  const { rows } = useCanvasEditorState();
  const { openRowId } = useBlockActionsMenu();
  const [viewCheckOverrides, setViewCheckOverrides] = useState<
    Record<string, boolean>
  >({});

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

  const row = rows.find((entry) => entry.rowId === rowId);
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

      const row = rows.find((entry) => entry.rowId === rowId);
      const block = row?.effectiveBlock;
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

  const actionItems = useMemo(() => {
    const items: ActionMenuEntry[] = [];

    if (canTurnInto) {
      for (const item of turnIntoItems) {
        const Icon = item.icon;
        items.push({
          id: `turn-into-${item.key}`,
          label: item.label,
          keywords: ["turn into", ...item.keywords, ...item.aliases],
          icon: <Icon />,
          onSelect: () => {
            if (item.key === turnIntoValue) {
              return;
            }
            onConvert?.(item);
          },
        });
      }
    }

    if (viewOptions) {
      for (const item of viewOptions.items) {
        items.push({
          id: `view-${item.id}`,
          label: item.label,
          keywords: [viewOptions.label.toLowerCase(), "view", "embed"],
          onSelect: () => {
            handleViewToggle(
              item.id,
              !(resolvedViewChecks[item.id] ?? item.checked)
            );
          },
        });
      }
    }

    if (tableBlock) {
      items.push({
        id: "table-fit-to-width",
        label: "Fit to width",
        keywords: ["table", "width", "fit", "resize"],
        icon: <IconArrowsHorizontal />,
        onSelect: () => {
          const targetWidthPx = measureTableFitTargetWidthPx(tableBlock.id);
          if (targetWidthPx === null) {
            return;
          }
          dispatch({
            type: "table.fitToWidth",
            tableId: tableBlock.id,
            targetWidthPx,
          });
        },
      });
      items.push({
        id: "table-header-row",
        label: "Header row",
        keywords: ["table", "header", "row"],
        icon: <IconTableRow />,
        onSelect: () => {
          dispatch({
            type: "table.toggleHeaderRow",
            tableId: tableBlock.id,
            enabled: !tableBlock.props.hasHeaderRow,
          });
        },
      });
      items.push({
        id: "table-header-column",
        label: "Header column",
        keywords: ["table", "header", "column"],
        icon: <IconTableColumn />,
        onSelect: () => {
          dispatch({
            type: "table.toggleHeaderColumn",
            tableId: tableBlock.id,
            enabled: !tableBlock.props.hasHeaderColumn,
          });
        },
      });

      if (lastTableRowId) {
        items.push({
          id: "table-add-row",
          label: "Add row",
          keywords: ["table", "row", "insert"],
          icon: <IconRowInsertBottom />,
          onSelect: () => {
            dispatch({
              type: "table.addRow",
              tableRowId: lastTableRowId,
              edge: "after",
            });
          },
        });
        items.push({
          id: "table-add-column",
          label: "Add column",
          keywords: ["table", "column", "insert"],
          icon: <IconColumnInsertRight />,
          onSelect: () => {
            dispatch({
              type: "table.addColumn",
              tableId: tableBlock.id,
              columnIndex: Math.max(0, tableColumnCount - 1),
              edge: "after",
            });
          },
        });
      }
    }

    items.push({
      id: "duplicate",
      label: "Duplicate",
      keywords: ["copy", "clone"],
      icon: <IconCopy />,
      onSelect: () => {
        onDuplicate?.();
      },
    });
    items.push({
      id: "delete",
      label: "Delete",
      keywords: ["remove", "trash"],
      icon: <IconTrash />,
      destructive: true,
      onSelect: () => {
        onDelete?.();
      },
    });

    return items;
  }, [
    canTurnInto,
    dispatch,
    lastTableRowId,
    onConvert,
    onDelete,
    onDuplicate,
    resolvedViewChecks,
    tableBlock,
    tableColumnCount,
    turnIntoItems,
    turnIntoValue,
    viewOptions,
    handleViewToggle,
  ]);

  return (
    <DropdownMenuGroup>
      <ActionMenuSearchSection
        activeKey={menuOpen ? rowId : null}
        items={actionItems}
      >
        {blockTypeLabel ? (
          <DropdownMenuLabel>{blockTypeLabel}</DropdownMenuLabel>
        ) : null}
        {canTurnInto ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconExchange />
              Turn into
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40" data-canvas-row-menu>
              <DropdownMenuRadioGroup
                onValueChange={(key) => {
                  const item = turnIntoItems.find(
                    (turnIntoItem) => turnIntoItem.key === key
                  );
                  if (!item || key === turnIntoValue) {
                    return;
                  }
                  onConvert?.(item);
                }}
                value={turnIntoValue}
              >
                {turnIntoItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuRadioItem key={item.key} value={item.key}>
                      <Icon />
                      {item.label}
                    </DropdownMenuRadioItem>
                  );
                })}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {viewOptions ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{viewOptions.label}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-40" data-canvas-row-menu>
              {viewOptions.items.map((item) => (
                <DropdownMenuCheckboxItem
                  checked={resolvedViewChecks[item.id] ?? item.checked}
                  key={item.id}
                  onCheckedChange={(checked) => {
                    handleViewToggle(item.id, checked === true);
                  }}
                >
                  {item.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {tableBlock ? (
          <>
            <DropdownMenuItem
              onClick={() => {
                const targetWidthPx = measureTableFitTargetWidthPx(
                  tableBlock.id
                );
                if (targetWidthPx === null) {
                  return;
                }
                dispatch({
                  type: "table.fitToWidth",
                  tableId: tableBlock.id,
                  targetWidthPx,
                });
              }}
            >
              <IconArrowsHorizontal />
              Fit to width
            </DropdownMenuItem>
            <DropdownMenuSwitchItem
              checked={tableBlock.props.hasHeaderRow}
              onCheckedChange={(enabled) => {
                dispatch({
                  type: "table.toggleHeaderRow",
                  tableId: tableBlock.id,
                  enabled,
                });
              }}
            >
              <IconTableRow />
              Header row
            </DropdownMenuSwitchItem>
            <DropdownMenuSwitchItem
              checked={tableBlock.props.hasHeaderColumn}
              onCheckedChange={(enabled) => {
                dispatch({
                  type: "table.toggleHeaderColumn",
                  tableId: tableBlock.id,
                  enabled,
                });
              }}
            >
              <IconTableColumn />
              Header column
            </DropdownMenuSwitchItem>
            {lastTableRowId ? (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    dispatch({
                      type: "table.addRow",
                      tableRowId: lastTableRowId,
                      edge: "after",
                    });
                  }}
                >
                  <IconRowInsertBottom />
                  Add row
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    dispatch({
                      type: "table.addColumn",
                      tableId: tableBlock.id,
                      columnIndex: Math.max(0, tableColumnCount - 1),
                      edge: "after",
                    });
                  }}
                >
                  <IconColumnInsertRight />
                  Add column
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null}
        {hasBlockSpecificActions || blockTypeLabel ? (
          <DropdownMenuSeparator />
        ) : null}
        <DropdownMenuItem onClick={() => onDuplicate?.()}>
          <IconCopy />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDelete?.()}>
          <IconTrash />
          Delete
        </DropdownMenuItem>
      </ActionMenuSearchSection>
    </DropdownMenuGroup>
  );
}
