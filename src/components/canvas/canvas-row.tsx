import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
import type { CanvasRow } from "@/db/queries/merge-blocks.ts";
import { useCanvasSlashMenu } from "@/hooks/use-canvas-slash-menu.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";

interface CanvasRowViewProps {
  autoFocus?: boolean;
  autoFocusOffset?: number;
  autoFocusPlacement?: "start" | "end";
  mode: "view" | "edit";
  onFocusHandled: () => void;
  pages?: PageSummary[];
  row: CanvasRow;
}

function CanvasRowViewOnly({ row, onFocusHandled }: CanvasRowViewProps) {
  return (
    <BlockTreeNode mode="view" onFocusHandled={onFocusHandled} row={row} />
  );
}

function CanvasRowEditInner({
  row,
  onFocusHandled,
  autoFocus = false,
  autoFocusOffset,
  autoFocusPlacement,
  pages = [],
}: CanvasRowViewProps) {
  const {
    closeSlashMenu,
    confirmSlashSelection,
    dismissSlashMenu,
    handleExitLinkPhase,
    handleSlashInput,
    navigateSlashSelection,
    slashCaret,
    slashFieldRef,
    slashMenuOpen,
    slashPhase,
  } = useCanvasSlashMenu(row, pages);

  return (
    <BlockTreeNode
      autoFocus={autoFocus}
      autoFocusOffset={autoFocusOffset}
      autoFocusPlacement={autoFocusPlacement}
      fieldRef={slashFieldRef}
      mode="edit"
      onFocusHandled={onFocusHandled}
      onSlash={handleSlashInput}
      onSlashClose={closeSlashMenu}
      onSlashDismiss={dismissSlashMenu}
      onSlashLinkBack={handleExitLinkPhase}
      onSlashMenuConfirm={confirmSlashSelection}
      onSlashMenuNavigate={navigateSlashSelection}
      row={row}
      slashCaret={slashCaret}
      slashMenuOpen={slashMenuOpen}
      slashPhase={slashPhase}
    />
  );
}

function CanvasRowEdit(props: CanvasRowViewProps) {
  return <CanvasRowEditInner {...props} />;
}

export function CanvasRowView(props: CanvasRowViewProps) {
  if (props.mode === "view") {
    return <CanvasRowViewOnly {...props} />;
  }

  return <CanvasRowEdit {...props} />;
}
