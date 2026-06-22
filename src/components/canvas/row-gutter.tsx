import { BlockGutter } from "@/components/canvas/block-gutter.tsx";
import type { BlockViewOption } from "@/components/canvas/block-gutter-menu.tsx";
import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import { getCanvasGutterAlignClassName } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import type { Block } from "@/lib/schemas/block.ts";

interface RowGutterProps {
  onInsert?: (edge: "before" | "after") => void;
  row: CanvasRow;
}

function turnIntoValueFromBlock(block: Block): string | undefined {
  if (block.type === "heading") {
    return `heading-${block.props.level}`;
  }
  if (
    block.type === "text" ||
    block.type === "quote" ||
    block.type === "callout"
  ) {
    return block.type;
  }
  return;
}

function buildEmbedViewOptions(
  row: CanvasRow
): { items: BlockViewOption[]; label: string } | undefined {
  const block = row.effectiveBlock;
  if (block.type !== "embed" || block.props.url.trim().length === 0) {
    return;
  }

  return {
    label: "Change view",
    items: [
      {
        id: "showTitle",
        label: "Show title",
        checked: block.props.showTitle ?? false,
      },
      {
        id: "showUrl",
        label: "Show URL",
        checked: block.props.showUrl ?? false,
      },
    ],
  };
}

function canTurnIntoBlock(row: CanvasRow): boolean {
  const { type } = row.effectiveBlock;
  return (
    type === "text" ||
    type === "heading" ||
    type === "quote" ||
    type === "callout"
  );
}

export function RowGutter({ row, onInsert }: RowGutterProps) {
  const {
    deleteRow,
    deleteSelection,
    dispatch,
    duplicateRow,
    insertAfter,
    insertBefore,
    clearSelection,
    selectRow,
    toggleRowSelection,
  } = useCanvasEditorContext();
  const { isRowSelected, selectedRowIds } = useCanvasSelection();

  return (
    <BlockGutter
      alignClassName={getCanvasGutterAlignClassName(row.effectiveBlock)}
      canTurnInto={canTurnIntoBlock(row)}
      isSelected={isRowSelected(row.rowId)}
      onConvert={(item) => {
        applyBlockConversion(row, item, dispatch);
        dispatch({ type: "focus.set", rowId: row.rowId, placement: "start" });
      }}
      onDelete={() => {
        if (selectedRowIds.length > 1) {
          deleteSelection();
          return;
        }
        deleteRow(row.rowId);
      }}
      onDragInteractionStart={() => clearSelection()}
      onDuplicate={() => duplicateRow(row.rowId)}
      onInsert={
        onInsert ??
        ((edge) =>
          edge === "before" ? insertBefore(row.rowId) : insertAfter(row.rowId))
      }
      onMenuOpen={() => {
        if (!isRowSelected(row.rowId)) {
          selectRow(row.rowId);
        }
      }}
      onSelect={(event) => {
        toggleRowSelection(row.rowId, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
        });
      }}
      rowId={row.rowId}
      turnIntoValue={turnIntoValueFromBlock(row.effectiveBlock)}
      viewOptions={buildEmbedViewOptions(row)}
    />
  );
}
