/** Measure the scroll viewport width available for table columns (excludes block gutter). */
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
  if (!(viewport instanceof HTMLElement)) {
    return layout.getBoundingClientRect().width;
  }

  const gutter = layout.querySelector("[data-table-block-gutter]");
  const gutterWidth =
    gutter instanceof HTMLElement ? gutter.getBoundingClientRect().width : 0;

  return Math.max(0, viewport.clientWidth - gutterWidth);
}
