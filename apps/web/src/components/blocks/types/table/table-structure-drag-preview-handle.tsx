import { IconGripHorizontal, IconGripVertical } from "@tabler/icons-react";

import { cn } from "@/lib/utils.ts";

/** Half of the structure handle size — handle center sits on the row/column edge. */
export const TABLE_STRUCTURE_DRAG_HANDLE_OUTSET_PX = 6;

/** Accent grip shown on table row/column drag previews (matches grabbing handle chrome). */
export function TableStructureDragPreviewHandle({
  axis,
}: {
  axis: "column" | "row";
}) {
  const GripIcon = axis === "row" ? IconGripVertical : IconGripHorizontal;
  const gripPadding =
    axis === "row" ? "mx-px px-0.5 py-1" : "mx-px px-1 py-0.5";

  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-sm border border-primary bg-primary text-primary-foreground shadow-sm",
        gripPadding,
        axis === "row" ? "h-5 w-3" : "h-3 w-5"
      )}
    >
      <GripIcon className="size-3 shrink-0" />
    </span>
  );
}
