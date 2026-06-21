import type { ReactNode } from "react";
import { BlockRenderer } from "@/components/blocks/block-renderer.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasRowShell } from "@/components/canvas/canvas-row-shell.tsx";
import { RowGutter } from "@/components/canvas/row-gutter.tsx";
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
  const parentType = row.effectiveBlock.type;

  return (
    <>
      {row.children.map((child, index) =>
        renderItem({
          child,
          index,
          children: (
            <CanvasRowShell
              contentClassName={contentClassName}
              gutter={mode === "edit" ? <RowGutter row={child} /> : null}
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
