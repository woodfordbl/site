import {
  IconArrowsHorizontal,
  IconColumnInsertRight,
  IconCopy,
  IconExternalLink,
  IconLink,
  IconMoodSmile,
  IconPencil,
  IconRefresh,
  IconRowInsertBottom,
  IconTableColumn,
  IconTableRow,
  IconTrash,
  IconTypography,
} from "@tabler/icons-react";
import { useMemo } from "react";

import { BlockColorSwatch } from "@/components/canvas/block-color-swatch.tsx";
import type { BlockGutterMenuItemsInput } from "@/components/canvas/block-gutter-menu/block-gutter-menu-types.ts";
import {
  BLOCK_COLOR_DEFS,
  BLOCK_COLOR_IDS,
} from "@/lib/blocks/block-colors.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";

/** Searchable color entries, following the block's color capability. */
function buildBlockColorItems(
  capability: BlockGutterMenuItemsInput["blockColorCapability"],
  handleSetBlockColor: BlockGutterMenuItemsInput["handleSetBlockColor"],
  handleSetBlockBackground: BlockGutterMenuItemsInput["handleSetBlockBackground"]
): ActionMenuEntry[] {
  const items: ActionMenuEntry[] = [];

  if (capability.text) {
    for (const color of BLOCK_COLOR_IDS) {
      items.push({
        id: `color-text-${color}`,
        label: `${BLOCK_COLOR_DEFS[color].label} text`,
        keywords: ["color", "text color", color],
        icon: <BlockColorSwatch color={color} variant="text" />,
        onSelect: () => {
          handleSetBlockColor(color);
        },
      });
    }
    items.push({
      id: "color-text-default",
      label: "Default text",
      keywords: ["color", "text color", "default", "reset"],
      icon: <BlockColorSwatch color={undefined} variant="text" />,
      onSelect: () => {
        handleSetBlockColor(undefined);
      },
    });
  }

  if (capability.background) {
    for (const color of BLOCK_COLOR_IDS) {
      items.push({
        id: `color-bg-${color}`,
        label: `${BLOCK_COLOR_DEFS[color].label} background`,
        keywords: ["color", "background color", "highlight", color],
        icon: <BlockColorSwatch color={color} variant="background" />,
        onSelect: () => {
          handleSetBlockBackground(color);
        },
      });
    }
    items.push({
      id: "color-bg-default",
      label: "Default background",
      keywords: ["color", "background color", "default", "reset"],
      icon: <BlockColorSwatch color={undefined} variant="background" />,
      onSelect: () => {
        handleSetBlockBackground(undefined);
      },
    });
  }

  return items;
}

export function useBlockGutterMenuItems(
  context: BlockGutterMenuItemsInput
): ActionMenuEntry[] {
  const {
    calloutBlock,
    canTurnInto,
    embedBlock,
    handleAddCalloutIcon,
    handleEditCalloutIcon,
    handleDuplicate,
    handleDelete,
    handleEmbedCopyLink,
    handleEmbedOpenInBrowser,
    handleEmbedReplace,
    handleEmbedToggleCaption,
    handleFitToWidth,
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    handleAddRow,
    handleAddColumn,
    blockColorCapability,
    handleSetBlockBackground,
    handleSetBlockColor,
    handleTurnInto,
    lastTableRowId,
    tableBlock,
    turnIntoItems,
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

    if (embedBlock) {
      items.push({
        id: "embed-replace",
        label: "Replace",
        keywords: ["embed", "replace", "url", "link"],
        icon: <IconRefresh />,
        onSelect: handleEmbedReplace,
      });
      items.push({
        id: "embed-caption",
        label: "Caption",
        keywords: ["embed", "caption", "description"],
        icon: <IconTypography />,
        onSelect: () => {
          handleEmbedToggleCaption(!(embedBlock.props.showCaption ?? false));
        },
      });
      items.push({
        id: "embed-open-in-browser",
        label: "Open in browser",
        keywords: ["embed", "open", "browser", "external"],
        icon: <IconExternalLink />,
        onSelect: handleEmbedOpenInBrowser,
      });
      items.push({
        id: "embed-copy-link",
        label: "Copy link",
        keywords: ["embed", "copy", "link", "url"],
        icon: <IconLink />,
        onSelect: handleEmbedCopyLink,
      });
    }

    if (calloutBlock) {
      if (calloutBlock.props.icon) {
        items.push({
          id: "callout-edit-icon",
          label: "Edit icon",
          keywords: ["callout", "edit", "change", "icon", "glyph", "emoji"],
          icon: <IconPencil />,
          onSelect: handleEditCalloutIcon,
        });
      } else {
        items.push({
          id: "callout-add-icon",
          label: "Add icon",
          keywords: ["callout", "add", "icon", "glyph", "emoji"],
          icon: <IconMoodSmile />,
          onSelect: handleAddCalloutIcon,
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

    items.push(
      ...buildBlockColorItems(
        blockColorCapability,
        handleSetBlockColor,
        handleSetBlockBackground
      )
    );

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
    calloutBlock,
    canTurnInto,
    embedBlock,
    handleAddCalloutIcon,
    handleEditCalloutIcon,
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
    blockColorCapability,
    lastTableRowId,
    tableBlock,
    turnIntoItems,
  ]);
}
