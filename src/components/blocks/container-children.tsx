import type { ReactNode } from "react";
import { BlockRenderer } from "@/components/blocks/block-renderer.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasRowShell } from "@/components/canvas/canvas-row-shell.tsx";
import { RowGutter } from "@/components/canvas/row-gutter.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";

interface RenderContainerItemOptions {
  child: CanvasRow;
  children: ReactNode;
  index: number;
}

interface ContainerChildrenProps {
  contentClassName?: string;
  mode: BlockMode;
  renderBeforeContent?: (child: CanvasRow, index: number) => ReactNode;
  renderItem: (options: RenderContainerItemOptions) => ReactNode;
  row: CanvasRow;
}

export function ContainerChildren({
  contentClassName,
  mode,
  renderBeforeContent,
  renderItem,
  row,
}: ContainerChildrenProps) {
  const { clearFocus } = useCanvasEditorContext();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const parentType = row.effectiveBlock.type;
  const editable = mode === "edit";

  return (
    <>
      {row.children.map((child, index) =>
        renderItem({
          child,
          index,
          children: (
            <CanvasRowShell
              contentClassName={contentClassName}
              // Coarse pointers (mobile/touch) drop the grip and reorder via a
              // long-press gesture on the row body; fine pointers (incl. narrow
              // desktop windows) keep the hover-revealed gutter grip.
              enableTouchGesture={editable && isCoarsePrimaryPointer}
              gutter={
                editable && !isCoarsePrimaryPointer ? (
                  <RowGutter row={child} />
                ) : null
              }
              row={child}
            >
              {renderBeforeContent?.(child, index)}
              <div className="min-w-0 flex-1">
                <BlockRenderer
                  mode={mode}
                  onFocusHandled={clearFocus}
                  parentType={parentType}
                  row={child}
                />
              </div>
            </CanvasRowShell>
          ),
        })
      )}
    </>
  );
}
