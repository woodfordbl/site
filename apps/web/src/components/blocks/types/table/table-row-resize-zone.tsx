interface TableRowResizeZoneProps {
  /** Double-click clears the explicit height, returning the row to auto-height. */
  onReset: (tableRowId: string) => void;
  onResizeStart: (
    tableRowId: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => void;
  tableRowId: string;
  tableWidthPx: number;
}

/**
 * Full-width row divider straddling a row's bottom border. Symmetric to
 * {@link TableColumnResizeZone}: drag vertically to set the row height. Rendered
 * inside the row's first cell so it can be anchored to that row's bottom edge.
 */
export function TableRowResizeZone({
  onReset,
  onResizeStart,
  tableRowId,
  tableWidthPx,
}: TableRowResizeZoneProps) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 z-20 flex translate-y-1/2 touch-none"
      style={{ width: tableWidthPx }}
    >
      <button
        aria-label="Resize rows"
        className="pointer-events-auto relative h-3 w-full cursor-row-resize touch-none rounded-sm outline-none after:absolute after:inset-x-0 after:top-1/2 after:h-[2px] after:-translate-y-1/2 after:bg-selection after:opacity-0 after:transition-[opacity,background-color] after:duration-150 after:ease-out hover:after:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:after:opacity-100 active:after:opacity-100"
        onDoubleClick={() => {
          onReset(tableRowId);
        }}
        onPointerDown={(event) => {
          onResizeStart(tableRowId, event);
        }}
        type="button"
      />
    </div>
  );
}
