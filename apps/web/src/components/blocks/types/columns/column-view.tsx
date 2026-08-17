import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
import { useDropTarget } from "@/components/dnd/use-dnd.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import type { DropTarget } from "@/lib/canvas/resolve-drop-target.ts";
import { cn } from "@/lib/utils.ts";

interface ColumnViewProps {
  columnRow: CanvasRow;
  mode: BlockMode;
}

export function ColumnView({ columnRow, mode }: ColumnViewProps) {
  const showScopeStart = useDropTarget(
    (target: DropTarget | null) =>
      target?.rowId === columnRow.rowId && target.atScopeStart === true
  );

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-full min-w-0 flex-1 flex-col gap-0",
        columnRow.children.length === 0 && "min-h-16"
      )}
      data-canvas-scope={columnRow.rowId}
      data-column-content
    >
      {showScopeStart ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 -translate-y-1/2 bg-selection-primary"
        />
      ) : null}
      {columnRow.children.map((child) => (
        <BlockTreeNode
          key={child.rowId}
          mode={mode}
          parentType="column"
          row={child}
        />
      ))}
    </div>
  );
}
