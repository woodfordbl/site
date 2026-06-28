/**
 * Measure the width available to the table grid inside its scroll viewport, so
 * "Fit to width" sizes the columns to exactly fill it without overflowing. The
 * grid sits inside a padded frame (left inset + a right gutter that holds the
 * add-column button and the last-column resize handle); both must be subtracted
 * or the fitted table spills past the viewport and gets cut off / scrolls.
 */
export function measureTableFitTargetWidthPx(tableId: string): number | null {
  if (typeof document === "undefined") {
    return null;
  }

  const layout = document.querySelector(
    `[data-table-layout][data-table-id="${CSS.escape(tableId)}"]`
  );
  if (!(layout instanceof HTMLElement)) {
    return null;
  }

  const viewport = layout.querySelector('[data-slot="scroll-area-viewport"]');
  const table = layout.querySelector("table");
  if (!(viewport instanceof HTMLElement && table instanceof HTMLElement)) {
    return layout.getBoundingClientRect().width;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const tableRect = table.getBoundingClientRect();

  // The table's left offset from the scroll-content origin (scroll-independent).
  const leftInset = tableRect.left - viewportRect.left + viewport.scrollLeft;

  // Right gutter that must stay on-screen beside the grid (add-column button +
  // last-column resize handle live in the frame's right padding).
  const frame = table.closest<HTMLElement>("[data-table-frame]");
  const rightReserve = frame
    ? Number.parseFloat(getComputedStyle(frame).paddingRight) || 0
    : 0;

  return Math.max(0, viewport.clientWidth - leftInset - rightReserve);
}
