import type { VirtualItem } from "@tanstack/react-virtual";
import type { ComponentProps, ReactNode } from "react";

import {
  GRID_ROW_HEIGHT_PX,
  type GridItem,
  type RowSelectDisplay,
  SELECTION_COLUMN_WIDTH_PX,
} from "@/components/database/database-grid-helpers.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { cn } from "@/lib/utils.ts";

/** Peek overlay checkboxes — suppress focus on press so scroll-into-view does not yank the grid. */
function PeekCheckbox({
  className,
  onPointerDown,
  ...props
}: ComponentProps<typeof Checkbox>): ReactNode {
  return (
    <Checkbox
      {...props}
      className={className}
      onPointerDown={(event) => {
        event.preventDefault();
        onPointerDown?.(event);
      }}
    />
  );
}

interface SelectColumnPeekLayerProps {
  allSelected: boolean;
  hasAnyRowSelection: boolean;
  items: readonly GridItem[];
  onCheckedChange: (checked: boolean) => void;
  onToggleSelected: (
    rowId: string,
    checked: boolean,
    shiftKey: boolean
  ) => void;
  rowNumberById: ReadonlyMap<string, number>;
  rowSelectDisplay: RowSelectDisplay;
  scrollTop: number;
  selectedIdSet: ReadonlySet<string>;
  someSelected: boolean;
  viewportHeight: number;
  virtualItems: readonly VirtualItem[];
}

/**
 * Popover-like floating select column when index 0 is clipped by horizontal
 * scroll. Anchored to the sticky header row so the select-all band aligns
 * with the table header; body rows track vertical scroll inside the viewport.
 */
export function SelectColumnPeekLayer({
  allSelected,
  hasAnyRowSelection,
  items,
  onCheckedChange,
  onToggleSelected,
  rowNumberById,
  rowSelectDisplay,
  scrollTop,
  selectedIdSet,
  someSelected,
  viewportHeight,
  virtualItems,
}: SelectColumnPeekLayerProps): ReactNode {
  const bodyHeight = viewportHeight - GRID_ROW_HEIGHT_PX;

  return (
    <>
      <div
        className="pointer-events-auto absolute top-0 left-0 z-40 flex items-center justify-center border-border border-r border-b bg-popover text-popover-foreground"
        style={{
          width: SELECTION_COLUMN_WIDTH_PX,
          height: GRID_ROW_HEIGHT_PX,
        }}
      >
        <PeekCheckbox
          aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
          checked={allSelected}
          indeterminate={someSelected}
          onCheckedChange={(checked) => {
            onCheckedChange(checked === true);
          }}
        />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute left-0 z-30 overflow-hidden border-border border-r border-b bg-popover text-popover-foreground"
        style={{
          top: GRID_ROW_HEIGHT_PX,
          width: SELECTION_COLUMN_WIDTH_PX,
          height: bodyHeight,
        }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (item?.kind !== "row") {
            return null;
          }
          const rowTop = virtualRow.start - scrollTop;
          const rowBottom = rowTop + virtualRow.size;
          if (rowTop >= bodyHeight || rowBottom <= 0) {
            return null;
          }
          const row = item.row;
          const isSelected = selectedIdSet.has(row.id);
          const showSelectControl = isSelected || hasAnyRowSelection;
          const rowNumber = rowNumberById.get(row.id) ?? 0;
          return (
            <div
              className={cn(
                "pointer-events-auto absolute flex items-center justify-center",
                isSelected && "bg-muted/40"
              )}
              data-reveal-group=""
              key={row.id}
              style={{
                top: rowTop,
                height: virtualRow.size,
                width: SELECTION_COLUMN_WIDTH_PX,
              }}
            >
              {rowSelectDisplay === "number" ? (
                <div className="relative flex size-full items-center justify-center">
                  <span
                    aria-hidden={showSelectControl}
                    className={cn(
                      "swap-conceal text-muted-foreground text-xs tabular-nums",
                      showSelectControl && "opacity-0"
                    )}
                  >
                    {rowNumber}
                  </span>
                  <PeekCheckbox
                    aria-label="Select row"
                    checked={isSelected}
                    className={cn(
                      "swap-reveal absolute inset-0 m-auto",
                      showSelectControl && "opacity-100"
                    )}
                    onCheckedChange={(checked, eventDetails) => {
                      const shiftKey =
                        "shiftKey" in eventDetails.event &&
                        Boolean(
                          (eventDetails.event as { shiftKey?: boolean })
                            .shiftKey
                        );
                      onToggleSelected(row.id, checked === true, shiftKey);
                    }}
                  />
                </div>
              ) : (
                <PeekCheckbox
                  aria-label="Select row"
                  checked={isSelected}
                  className={cn(
                    rowSelectDisplay === "hover" &&
                      !showSelectControl &&
                      "hover-reveal",
                    showSelectControl &&
                      rowSelectDisplay !== "always" &&
                      "opacity-100"
                  )}
                  onCheckedChange={(checked, eventDetails) => {
                    const shiftKey =
                      "shiftKey" in eventDetails.event &&
                      Boolean(
                        (eventDetails.event as { shiftKey?: boolean }).shiftKey
                      );
                    onToggleSelected(row.id, checked === true, shiftKey);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
