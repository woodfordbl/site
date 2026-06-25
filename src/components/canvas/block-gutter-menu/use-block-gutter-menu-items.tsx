import {
  IconArrowsHorizontal,
  IconColumnInsertRight,
  IconCopy,
  IconRowInsertBottom,
  IconTableColumn,
  IconTableRow,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo } from "react";

import type { BlockGutterMenuItemsInput } from "@/components/canvas/block-gutter-menu/block-gutter-menu-types.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";

export function useBlockGutterMenuItems(
  context: BlockGutterMenuItemsInput
): ActionMenuEntry[] {
  const {
    canTurnInto,
    handleDuplicate,
    handleDelete,
    handleFitToWidth,
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    handleAddRow,
    handleAddColumn,
    handleTurnInto,
    handleViewToggle,
    lastTableRowId,
    resolvedViewChecks,
    tableBlock,
    turnIntoItems,
    viewOptions,
  } = context;

  return useMemo(() => {
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
            handleTurnInto(item.key);
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
        onSelect: handleFitToWidth,
      });
      items.push({
        id: "table-header-row",
        label: "Header row",
        keywords: ["table", "header", "row"],
        icon: <IconTableRow />,
        onSelect: () => {
          handleToggleHeaderRow(!tableBlock.props.hasHeaderRow);
        },
      });
      items.push({
        id: "table-header-column",
        label: "Header column",
        keywords: ["table", "header", "column"],
        icon: <IconTableColumn />,
        onSelect: () => {
          handleToggleHeaderColumn(!tableBlock.props.hasHeaderColumn);
        },
      });

      if (lastTableRowId) {
        items.push({
          id: "table-add-row",
          label: "Add row",
          keywords: ["table", "row", "insert"],
          icon: <IconRowInsertBottom />,
          onSelect: handleAddRow,
        });
        items.push({
          id: "table-add-column",
          label: "Add column",
          keywords: ["table", "column", "insert"],
          icon: <IconColumnInsertRight />,
          onSelect: handleAddColumn,
        });
      }
    }

    items.push({
      id: "duplicate",
      label: "Duplicate",
      keywords: ["copy", "clone"],
      icon: <IconCopy />,
      onSelect: handleDuplicate,
    });
    items.push({
      id: "delete",
      label: "Delete",
      keywords: ["remove", "trash"],
      icon: <IconTrash />,
      destructive: true,
      onSelect: handleDelete,
    });

    return items;
  }, [
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
  ]);
}
