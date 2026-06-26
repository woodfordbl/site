import { BlockGutter } from "@/components/canvas/block-gutter.tsx";
import { useRowGutterHandlers } from "@/components/canvas/use-row-gutter-handlers.ts";
import { getCanvasGutterAlignClassName } from "@/lib/blocks/block-spacing.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

interface RowGutterProps {
  onInsert?: (edge: "before" | "after") => void;
  row: CanvasRow;
}

export function RowGutter({ row, onInsert }: RowGutterProps) {
  const handlers = useRowGutterHandlers(row);

  return (
    <BlockGutter
      alignClassName={getCanvasGutterAlignClassName(row.effectiveBlock)}
      isSelected={handlers.isSelected}
      onConvert={handlers.onConvert}
      onDelete={handlers.onDelete}
      onDragInteractionStart={handlers.onDragInteractionStart}
      onDuplicate={handlers.onDuplicate}
      onInsert={onInsert ?? handlers.onInsert}
      onMenuOpen={handlers.onMenuOpen}
      onSelect={handlers.onSelect}
      rowId={row.rowId}
    />
  );
}
