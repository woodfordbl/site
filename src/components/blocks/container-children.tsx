import type { ReactNode } from "react";
import { BlockRenderer } from "@/components/blocks/block-renderer.tsx";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import type { CanvasRowHoverGroup } from "@/components/canvas/canvas-row-shell.tsx";
import { CanvasRowShell } from "@/components/canvas/canvas-row-shell.tsx";
import { RowGutter } from "@/components/canvas/row-gutter.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";

interface RenderContainerItemOptions {
  child: CanvasRow;
  children: ReactNode;
  index: number;
}

interface ContainerChildrenProps {
  contentClassName?: string;
  fieldRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  hoverGroup: CanvasRowHoverGroup;
  mode: BlockMode;
  onSlash?: (
    query: string,
    caret: FieldSelection,
    convertRowId?: string
  ) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  renderBeforeContent?: (child: CanvasRow, index: number) => ReactNode;
  renderItem: (options: RenderContainerItemOptions) => ReactNode;
  row: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}

export function ContainerChildren({
  row,
  mode,
  fieldRef,
  onSlash,
  onSlashClose,
  onSlashDismiss,
  onSlashLinkBack,
  onSlashMenuConfirm,
  onSlashMenuNavigate,
  slashCaret,
  slashMenuOpen,
  slashPhase,
  hoverGroup,
  contentClassName,
  renderBeforeContent,
  renderItem,
}: ContainerChildrenProps) {
  const { clearSelection } = useCanvasEditorContext();

  return (
    <>
      {row.children.map((child, index) =>
        renderItem({
          child,
          index,
          children: (
            <CanvasRowShell
              contentClassName={contentClassName}
              gutter={
                mode === "edit" ? (
                  <RowGutter hoverGroup={hoverGroup} row={child} />
                ) : null
              }
              hoverGroup={hoverGroup}
              row={child}
            >
              {renderBeforeContent?.(child, index)}
              <div className="min-w-0 flex-1">
                <BlockRenderer
                  block={child.effectiveBlock}
                  fieldRef={fieldRef}
                  mode={mode}
                  onSlash={
                    onSlash
                      ? (query, caret) => {
                          onSlash(query, caret, child.rowId);
                        }
                      : undefined
                  }
                  onSlashClose={onSlashClose}
                  onSlashDismiss={onSlashDismiss}
                  onSlashLinkBack={onSlashLinkBack}
                  onSlashMenuConfirm={onSlashMenuConfirm}
                  onSlashMenuNavigate={onSlashMenuNavigate}
                  onTextFocus={clearSelection}
                  row={child}
                  slashCaret={slashCaret}
                  slashMenuOpen={slashMenuOpen}
                  slashPhase={slashPhase}
                />
              </div>
            </CanvasRowShell>
          ),
        })
      )}
    </>
  );
}
