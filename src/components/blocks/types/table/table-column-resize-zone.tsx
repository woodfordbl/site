interface TableColumnResizeZoneProps {
  columnIndex: number;
  leftPx: number;
  onResizeStart: (
    leftIndex: number,
    rightIndex: number,
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
}

/** Full-height column divider — matches sidebar rail hover (`bg-sidebar-border`, 2px). */
export function TableColumnResizeZone({
  columnIndex,
  leftPx,
  onResizeStart,
}: TableColumnResizeZoneProps) {
  return (
    <div
      className="pointer-events-none absolute top-0 bottom-0 flex -translate-x-1/2 touch-none"
      style={{ left: leftPx }}
    >
      <button
        aria-label="Resize columns"
        className="pointer-events-auto relative h-full w-3 cursor-col-resize touch-none rounded-sm outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2 after:bg-sidebar-border after:opacity-0 after:transition-[opacity,background-color] after:duration-150 after:ease-out hover:after:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:opacity-100 active:after:opacity-100"
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onResizeStart(columnIndex, columnIndex + 1, event);
        }}
        type="button"
      />
    </div>
  );
}

function tableColumnBoundaryLeftPx(
  widths: number[],
  columnIndex: number
): number {
  let left = 0;
  for (let index = 0; index <= columnIndex; index += 1) {
    left += widths[index] ?? 0;
  }
  return left;
}

export function TableColumnResizeOverlay({
  columnCount,
  columnWidths,
  onResizeStart,
}: {
  columnCount: number;
  columnWidths: number[];
  onResizeStart: TableColumnResizeZoneProps["onResizeStart"];
}) {
  if (columnCount <= 1) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20"
      data-table-column-resize-overlay
    >
      {Array.from({ length: columnCount - 1 }, (_, columnIndex) => {
        const leftPx = tableColumnBoundaryLeftPx(columnWidths, columnIndex);
        return (
          <TableColumnResizeZone
            columnIndex={columnIndex}
            key={`boundary-${leftPx}`}
            leftPx={leftPx}
            onResizeStart={onResizeStart}
          />
        );
      })}
    </div>
  );
}
