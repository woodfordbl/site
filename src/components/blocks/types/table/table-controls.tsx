import { IconPlus } from "@tabler/icons-react";

import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const addControlBaseClassName = cn(
  "rounded-sm border-border text-muted-foreground opacity-0 transition-opacity",
  "hover:bg-muted/30 hover:text-foreground",
  "hover:opacity-100 focus-visible:opacity-100"
);

interface TableAddRowButtonProps {
  className?: string;
  lastRowId: string;
}

export function TableAddRowButton({
  className,
  lastRowId,
}: TableAddRowButtonProps) {
  const { dispatch } = useCanvasEditorContext();

  return (
    <Button
      aria-label="Add row"
      className={cn(
        addControlBaseClassName,
        "h-5 w-full",
        "group-has-[[data-table-last-row]:hover]/table-layout:opacity-100",
        className
      )}
      data-table-add-row
      onClick={() => {
        dispatch({
          type: "table.addRow",
          tableRowId: lastRowId,
          edge: "after",
        });
      }}
      size="icon-xs"
      type="button"
      variant="outline"
    >
      <IconPlus className="size-3" />
    </Button>
  );
}

interface TableAddColumnButtonProps {
  className?: string;
  columnCount: number;
  tableId: string;
}

/** Full-height control in the table's trailing gutter — reveals on last-column hover. */
export function TableAddColumnButton({
  className,
  columnCount,
  tableId,
}: TableAddColumnButtonProps) {
  const { dispatch } = useCanvasEditorContext();

  return (
    <Button
      aria-label="Add column"
      className={cn(
        addControlBaseClassName,
        "h-full min-h-0 w-5 shrink-0 self-stretch",
        "group-has-[[data-table-last-column]:hover]/table-layout:opacity-100",
        className
      )}
      data-table-add-column
      onClick={() => {
        dispatch({
          type: "table.addColumn",
          tableId,
          columnIndex: columnCount - 1,
          edge: "after",
        });
      }}
      size="icon-xs"
      type="button"
      variant="outline"
    >
      <IconPlus className="size-3" />
    </Button>
  );
}
