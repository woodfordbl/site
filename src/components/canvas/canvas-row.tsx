import { memo } from "react";

import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
import { useVisibleScopeRows } from "@/components/canvas/heading-collapse-context.tsx";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";

interface CanvasRowViewProps {
  mode: "view" | "edit";
  row: CanvasRow;
}

/**
 * One top-level canvas row. Memoized — with structural sharing in
 * `buildBlockTree`, only the edited row gets a new `row` identity per
 * keystroke, so unchanged rows bail out here.
 */
function CanvasRowViewImpl({ mode, row }: CanvasRowViewProps) {
  return <BlockTreeNode mode={mode} row={row} />;
}

export const CanvasRowView = memo(CanvasRowViewImpl);

/**
 * Render a sibling scope, hiding rows that sit under a collapsed heading. Used
 * for the page body in both the editor and the read-only view; column children
 * filter the same way via {@link useVisibleScopeRows} directly.
 */
export function CanvasRowList({
  mode,
  rows,
}: {
  mode: "view" | "edit";
  rows: CanvasRow[];
}) {
  const visibleRows = useVisibleScopeRows(rows);

  return (
    <>
      {visibleRows.map((row) => (
        <CanvasRowView key={row.rowId} mode={mode} row={row} />
      ))}
    </>
  );
}
