import type { BlockContainerProps } from "@/lib/canvas/block-spec.types.ts";
import { columnFlexStyle } from "@/lib/canvas/columns-layout.ts";
import { cn } from "@/lib/utils.ts";
import { ColumnView } from "./column-view.tsx";
import { ColumnResizeZone } from "./columns-resize-zone.tsx";
import { columnBlockWidth, useColumnResize } from "./use-column-resize.ts";

export function ColumnsView({ row, mode }: BlockContainerProps) {
  const columnRows = row.children;
  const { startResize, liveWidths } = useColumnResize({ columnRows });

  return (
    <div className="relative w-full" data-columns-layout>
      <div
        className={cn(
          "flex w-full min-w-0 items-stretch gap-0",
          "max-md:flex-col max-md:gap-4"
        )}
      >
        {columnRows.map((columnRow, index) => {
          const leftColumn = columnRows[index - 1];
          const block = columnRow.effectiveBlock;
          const width =
            liveWidths?.[columnRow.rowId] ??
            (block.type === "column" ? columnBlockWidth(block) : undefined);
          const flex = columnFlexStyle(width);
          const hasLeadingGutter = index > 0;

          return (
            <div
              className={cn(
                "relative flex min-w-0 items-stretch max-md:w-full max-md:[flex:1_1_auto!important]",
                hasLeadingGutter && "md:pl-12",
                hasLeadingGutter &&
                  "[&_.canvas-block-gutter]:justify-between [&_.canvas-block-gutter]:pr-0"
              )}
              data-column-id={columnRow.rowId}
              key={columnRow.rowId}
              style={{ flex: flex.flex, minWidth: flex.minWidth }}
            >
              {mode === "edit" && leftColumn ? (
                <ColumnResizeZone
                  leftColumnId={leftColumn.rowId}
                  onResizeStart={startResize}
                  rightColumnId={columnRow.rowId}
                />
              ) : null}
              <ColumnView columnRow={columnRow} mode={mode} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
