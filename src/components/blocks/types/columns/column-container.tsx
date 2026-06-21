import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";

import { ColumnView } from "./column-view.tsx";

/** Container shell when a `column` row is rendered via `BlockTreeNode` (unusual; normally nested in `ColumnsView`). */
export function ColumnContainer({ row, mode }: BlockContainerProps) {
  return <ColumnView columnRow={row} mode={mode} />;
}
