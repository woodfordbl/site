import { memo } from "react";

import { BlockTreeNode } from "@/components/canvas/block-tree-node.tsx";
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
 * Render a sibling scope. Collapsed toggle headings hide their own children
 * locally (the container simply does not render them), so the page body needs
 * no scope-level filtering here.
 */
export function CanvasRowList({
  mode,
  rows,
}: {
  mode: "view" | "edit";
  rows: CanvasRow[];
}) {
  return (
    <>
      {rows.map((row) => (
        <CanvasRowView key={row.rowId} mode={mode} row={row} />
      ))}
    </>
  );
}
