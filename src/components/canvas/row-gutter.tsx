import { BlockGutter } from "@/components/canvas/block-gutter.tsx";
import {
  useCanvasEditorContext,
  useCanvasSelection,
} from "@/components/canvas/canvas-editor-context.tsx";
import { useRowBlockActions } from "@/hooks/use-row-block-actions.ts";
import { getCanvasGutterAlignClassName } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

interface RowGutterProps {
  onInsert?: (edge: "before" | "after") => void;
  row: CanvasRow;
}

export function RowGutter({ row, onInsert }: RowGutterProps) {
  const { clearSelection, insertAfter, insertBefore, toggleRowSelection } =
    useCanvasEditorContext();
  const { isRowSelected } = useCanvasSelection();
  const { onConvert, onDelete, onDuplicate, onMenuOpen } =
    useRowBlockActions(row);

  return (
    <BlockGutter
      alignClassName={getCanvasGutterAlignClassName(row.effectiveBlock)}
      isSelected={isRowSelected(row.rowId)}
      onConvert={onConvert}
      onDelete={onDelete}
      onDragInteractionStart={() => clearSelection()}
      onDuplicate={onDuplicate}
      onInsert={
        onInsert ??
        ((edge) =>
          edge === "before" ? insertBefore(row.rowId) : insertAfter(row.rowId))
      }
      onMenuOpen={onMenuOpen}
      onSelect={(event) => {
        toggleRowSelection(row.rowId, {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
        });
      }}
      rowId={row.rowId}
    />
  );
}
