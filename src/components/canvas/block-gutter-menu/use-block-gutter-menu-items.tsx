import {
  IconArrowsHorizontal,
  IconColumnInsertRight,
  IconCopy,
  IconExternalLink,
  IconLink,
  IconPencil,
  IconRefresh,
  IconRowInsertBottom,
  IconTableColumn,
  IconTableRow,
  IconTrash,
  IconTypography,
} from "@tabler/icons-react";
import { useMemo } from "react";

import type { BlockGutterMenuItemsInput } from "@/components/canvas/block-gutter-menu/block-gutter-menu-types.ts";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";
import type { ActionMenuEntry } from "@/lib/canvas/filter-action-menu-items.ts";

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
          icon: <PageIconDisplay icon={DEFAULT_CALLOUT_ICON} />,
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
    handleToggleHeaderColumn,
    handleToggleHeaderRow,
    handleTurnInto,
    lastTableRowId,
    tableBlock,
    turnIntoItems,
  ]);
}
