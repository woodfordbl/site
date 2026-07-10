import { CANVAS_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-drop-target.ts";
import { TABLE_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-table-drop-target.ts";

/** Cap so huge databases stay usable as a native drag image. */
const DATABASE_DRAG_PREVIEW_MAX_HEIGHT_PX = 320;

function hasClassToken(el: Element, token: string): boolean {
  return el.classList.contains(token);
}

/**
 * Flattens virtualization on a cloned database `[role="grid"]` in place:
 * sticky headers / pinned cells → static, absolute body rows → relative flow,
 * and drops chrome that should not appear in the ghost.
 */
export function flattenDatabaseGridClone(grid: HTMLElement): void {
  for (const el of grid.querySelectorAll(
    '[data-slot="scroll-area-scrollbar"], .database-grid-pinned-shadow, .hover-reveal'
  )) {
    el.remove();
  }

  for (const el of grid.querySelectorAll("*")) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }

    const isSticky =
      hasClassToken(el, "sticky") ||
      el.style.position === "sticky" ||
      el.style.position === "fixed";
    const isAbsoluteRow =
      el.getAttribute("role") === "row" &&
      (hasClassToken(el, "absolute") ||
        el.style.position === "absolute" ||
        el.style.transform.includes("translateY"));

    if (isAbsoluteRow) {
      el.classList.remove("absolute", "top-0", "left-0");
      el.style.position = "relative";
      el.style.transform = "none";
      el.style.top = "auto";
      el.style.left = "auto";
      continue;
    }

    if (isSticky) {
      el.classList.remove("sticky", "top-0", "left-0", "z-10", "z-20", "z-30");
      el.style.position = "static";
      el.style.top = "";
      el.style.left = "";
      el.style.zIndex = "";
    }
  }

  const rowgroup = grid.querySelector('[role="rowgroup"]');
  if (rowgroup instanceof HTMLElement) {
    rowgroup.style.height = "auto";
    rowgroup.style.minHeight = "0";
  }
}

/**
 * Clones a live database `[role="grid"]`, flattens virtualization, and wraps
 * it in an opaque card. Prefer {@link buildDatabaseBlockDragPreview} when the
 * full block (title + chips) should be included.
 */
export function sanitizeDatabaseGridClone(grid: HTMLElement): HTMLElement {
  const sourceWidth = grid.getBoundingClientRect().width;
  const clone = grid.cloneNode(true) as HTMLElement;
  flattenDatabaseGridClone(clone);
  return wrapDatabaseDragPreview(clone, sourceWidth);
}

function wrapDatabaseDragPreview(
  content: HTMLElement,
  widthPx: number
): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-database-drag-preview", "");
  wrapper.className =
    "overflow-hidden rounded-lg bg-background p-2 shadow-md ring-1 ring-foreground/10";
  Object.assign(wrapper.style, {
    maxHeight: `${DATABASE_DRAG_PREVIEW_MAX_HEIGHT_PX}px`,
    overflow: "hidden",
    ...(widthPx > 0 ? { width: `${widthPx}px` } : {}),
  });
  wrapper.appendChild(content);
  return wrapper;
}

/**
 * Full-block database drag preview: title, view switcher, filter/sort chips,
 * and the visible grid — with only the virtualized grid flattened so sticky /
 * absolute layers do not stack into a broken ghost.
 */
function buildDatabaseBlockDragPreview(shell: Element): HTMLElement | null {
  const block = shell.querySelector("[data-database-block]");
  if (!(block instanceof HTMLElement)) {
    return null;
  }

  const sourceWidth = Math.max(
    block.getBoundingClientRect().width,
    shell.querySelector('[role="grid"]')?.getBoundingClientRect().width ?? 0
  );

  const clone = block.cloneNode(true) as HTMLElement;

  // Select-lane bleed (`-ml-12`) is for the live canvas gutter — neutralize
  // it in the ghost so the card edges stay square.
  for (const el of clone.querySelectorAll("*")) {
    if (!(el instanceof HTMLElement)) {
      continue;
    }
    if (hasClassToken(el, "-ml-12")) {
      el.classList.remove("-ml-12");
      el.style.marginLeft = "0";
    }
  }

  const grid = clone.querySelector('[role="grid"]');
  if (grid instanceof HTMLElement) {
    flattenDatabaseGridClone(grid);
  } else {
    // List/board/chart views: still strip hover chrome from the clone.
    for (const el of clone.querySelectorAll(".hover-reveal")) {
      el.remove();
    }
  }

  return wrapDatabaseDragPreview(clone, sourceWidth);
}

/** Resolves the DOM node cloned as the native drag image for a canvas row drag. */
export function resolveCanvasRowDragPreviewNode(
  rowId: string
): HTMLElement | null {
  const escapedId = CSS.escape(rowId);

  // Table blocks sit in a full-width content column but the grid itself is only
  // as wide as its columns. Clone the `<table>` (scoped by data-table-id, which
  // equals this row's id) so the preview keeps the table's real size rather than
  // ballooning to the content width. data-table-id avoids matching a *nested*
  // table when a container row is dragged.
  const tableGrid = document.querySelector(
    `[data-table-id="${escapedId}"] table`
  );
  if (tableGrid instanceof HTMLElement) {
    return tableGrid;
  }

  const shell = document.querySelector(
    `[${CANVAS_ROW_ATTRIBUTE}="${escapedId}"]`
  );
  if (shell instanceof HTMLElement) {
    // Database blocks: clone the full surface (title + chips + grid), but
    // flatten only the virtualized grid so sticky/absolute cells do not stack.
    if (shell.querySelector("[data-database-block]")) {
      return buildDatabaseBlockDragPreview(shell);
    }

    const canvasContent = shell.querySelector("[data-canvas-row-content]");
    if (canvasContent instanceof HTMLElement) {
      return canvasContent;
    }
  }

  const tableRow = document.querySelector(
    `[${TABLE_ROW_ATTRIBUTE}="${escapedId}"]`
  );
  return tableRow instanceof HTMLElement ? tableRow : null;
}
