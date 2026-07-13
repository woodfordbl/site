import { IconPlus } from "@tabler/icons-react";
import { useCallback } from "react";

import { useTableCountScrub } from "@/components/blocks/types/table/use-table-count-scrub.ts";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

const addControlBaseClassName = cn(
  "hover-reveal rounded-sm border-border text-muted-foreground",
  "hover:bg-muted/30 hover:text-foreground",
  "hover:opacity-100 focus-visible:opacity-100"
);

interface TableAddRowButtonProps {
  className?: string;
  lastRowId: string;
  rowCount: number;
  tableId: string;
}

export function TableAddRowButton({
  className,
  lastRowId,
  rowCount,
  tableId,
}: TableAddRowButtonProps) {
  const { dispatch } = useCanvasEditorContext();

  const addRow = useCallback(() => {
    dispatch({
      type: "table.addRow",
      tableRowId: lastRowId,
      edge: "after",
    });
  }, [dispatch, lastRowId]);

  const { isScrubbing, scrubHandlers } = useTableCountScrub({
    axis: "row",
    baselineCount: rowCount,
    onClickAdd: addRow,
    tableId,
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Add row"
              className={cn(
                addControlBaseClassName,
                "h-5 w-full cursor-ns-resize touch-none",
                isScrubbing && "bg-muted/50 opacity-100",
                "group-has-[[data-table-last-row]:hover]/table-layout:opacity-100",
                "group-hover/add-row-host:opacity-100",
                className
              )}
              data-table-add-row
              size="icon-xs"
              type="button"
              variant="outline"
              {...scrubHandlers}
            >
              <IconPlus className="size-3" />
            </Button>
          }
        />
        <TooltipContent
          align="center"
          className="flex-col items-center gap-0.5 px-2 py-1 text-center"
          side="bottom"
        >
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold">Click</span>
            to add a new row
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold">Drag</span>
            to add or remove rows
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
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

  const addColumn = useCallback(() => {
    dispatch({
      type: "table.addColumn",
      tableId,
      columnIndex: columnCount - 1,
      edge: "after",
    });
  }, [columnCount, dispatch, tableId]);

  const { isScrubbing, scrubHandlers } = useTableCountScrub({
    axis: "column",
    baselineCount: columnCount,
    onClickAdd: addColumn,
    tableId,
  });

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Add column"
              className={cn(
                addControlBaseClassName,
                "h-full min-h-0 w-5 shrink-0 cursor-ew-resize touch-none self-stretch",
                isScrubbing && "bg-muted/50 opacity-100",
                "group-has-[[data-table-last-column]:hover]/table-layout:opacity-100",
                className
              )}
              data-table-add-column
              size="icon-xs"
              type="button"
              variant="outline"
              {...scrubHandlers}
            >
              <IconPlus className="size-3" />
            </Button>
          }
        />
        <TooltipContent
          className="flex-col items-start gap-0.5 px-2 py-1"
          side="left"
        >
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold">Click</span>
            to add a new column
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="font-semibold">Drag</span>
            to add or remove columns
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
