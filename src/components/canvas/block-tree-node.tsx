import { BlockRenderer } from "@/components/blocks/block-renderer.tsx";
import {
  getBlockSpec,
  isContainerSpec,
  resolveContainerComponent,
} from "@/components/blocks/registry.ts";
import "@/components/blocks/register-containers.ts";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasRowShell } from "@/components/canvas/canvas-row-shell.tsx";
import { RowGutter } from "@/components/canvas/row-gutter.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import type { BlockMode } from "@/lib/canvas/block-spec.types.ts";
import { isContainerBlockType } from "@/lib/canvas/block-spec.types.ts";
import type { FieldSelection } from "@/lib/editor/caret-navigation.ts";

interface BlockTreeNodeProps {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  fieldRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  mode: BlockMode;
  onFocusHandled: () => void;
  onSlash?: (query: string, caret: FieldSelection) => void;
  onSlashClose?: () => void;
  onSlashDismiss?: () => void;
  onSlashLinkBack?: () => void;
  onSlashMenuConfirm?: () => void;
  onSlashMenuNavigate?: (direction: "up" | "down") => void;
  row: CanvasRow;
  slashCaret?: FieldSelection;
  slashMenuOpen?: boolean;
  slashPhase?: "root" | "link";
}

export function BlockTreeNode({
  row,
  mode,
  autoFocus,
  autoFocusOffset,
  autoFocusPlacement,
  onFocusHandled,
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
}: BlockTreeNodeProps) {
  const { clearSelection, insertAfter, insertBefore, insertAtScopeStart } =
    useCanvasEditorContext();

  const spec = getBlockSpec(row.effectiveBlock.type);

  if (isContainerSpec(spec)) {
    const Container = resolveContainerComponent(spec);

    return (
      <CanvasRowShell
        gutter={
          mode === "edit" ? (
            <RowGutter
              hideWhenDescendantRowHovered={isContainerBlockType(
                row.effectiveBlock.type
              )}
              onInsert={(edge) => {
                if (edge === "before") {
                  insertBefore(row.rowId);
                  return;
                }

                const lastChild = row.children.at(-1);
                if (lastChild) {
                  insertAfter(lastChild.rowId);
                  return;
                }

                insertAtScopeStart(row.effectiveBlock.id);
              }}
              row={row}
            />
          ) : null
        }
        row={row}
      >
        <Container
          fieldRef={fieldRef}
          mode={mode}
          onSlash={onSlash}
          onSlashClose={onSlashClose}
          onSlashDismiss={onSlashDismiss}
          onSlashLinkBack={onSlashLinkBack}
          onSlashMenuConfirm={onSlashMenuConfirm}
          onSlashMenuNavigate={onSlashMenuNavigate}
          row={row}
          slashCaret={slashCaret}
          slashMenuOpen={slashMenuOpen}
          slashPhase={slashPhase}
        />
      </CanvasRowShell>
    );
  }

  const isDivider = row.effectiveBlock.type === "divider";

  return (
    <CanvasRowShell
      gutter={mode === "edit" ? <RowGutter row={row} /> : null}
      gutterClassName={isDivider ? "top-1/2 -translate-y-1/2" : undefined}
      row={row}
    >
      <BlockRenderer
        autoFocus={autoFocus}
        autoFocusOffset={autoFocusOffset}
        autoFocusPlacement={autoFocusPlacement}
        block={row.effectiveBlock}
        fieldRef={fieldRef}
        mode={mode}
        onAutoFocusHandled={onFocusHandled}
        onSlash={onSlash}
        onSlashClose={onSlashClose}
        onSlashDismiss={onSlashDismiss}
        onSlashLinkBack={onSlashLinkBack}
        onSlashMenuConfirm={onSlashMenuConfirm}
        onSlashMenuNavigate={onSlashMenuNavigate}
        onTextFocus={clearSelection}
        row={row}
        slashCaret={slashCaret}
        slashMenuOpen={slashMenuOpen}
        slashPhase={slashPhase}
      />
    </CanvasRowShell>
  );
}
