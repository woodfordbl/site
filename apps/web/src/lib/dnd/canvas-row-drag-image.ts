import { CANVAS_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-drop-target.ts";
import { TABLE_ROW_ATTRIBUTE } from "@/lib/canvas/resolve-table-drop-target.ts";

/** Cap so huge databases stay usable as a drag preview. */
const DATABASE_DRAG_PREVIEW_MAX_HEIGHT_PX = 320;

/** Card padding (`p-2`) inset between the preview's box and the cloned surface. */
const DATABASE_DRAG_PREVIEW_PADDING_PX = 8;

export interface CanvasRowDragPreviewSource {
  /** Live element to clone, or a detached card that is already the preview. */
  node: HTMLElement;
  /**
   * Viewport point mapping to `node`'s top-left corner. Set only for detached
   * previews, which cannot be measured against the live row.
   */
  origin?: { left: number; top: number };
}

function hasClassToken(el: Element, token: string): boolean {
  return el.classList.contains(token);
}

/**
 * Flattens virtualization on a cloned database `[role="grid"]` in place:
 * sticky headers / pinned cells → static, absolute body rows → relative flow,
 * and drops chrome that should not appear in the ghost.
 */
function flattenDatabaseGridClone(grid: HTMLElement): void {
  for (const el of grid.querySelectorAll(
    '[data-slot="scroll-area-scrollbar"], .hover-reveal'
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
 * Wraps a flattened clone in the opaque preview card. `widthPx` is the mirrored
 * surface's width; the card grows by its own padding so the clone renders at 1:1
 * and its columns do not reflow inside the ghost.
 */
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
    ...(widthPx > 0
      ? { width: `${widthPx + DATABASE_DRAG_PREVIEW_PADDING_PX * 2}px` }
      : {}),
  });
  wrapper.appendChild(content);
  return wrapper;
}

/**
 * Full-block database drag preview: title, view switcher, filter/sort chips,
 * and the visible grid — with only the virtualized grid flattened so sticky /
 * absolute layers do not stack into a broken ghost.
 */
function buildDatabaseBlockDragPreview(
  shell: Element
): CanvasRowDragPreviewSource | null {
  const block = shell.querySelector("[data-database-block]");
  if (!(block instanceof HTMLElement)) {
    return null;
  }

  const blockRect = block.getBoundingClientRect();
  const sourceWidth = Math.max(
    blockRect.width,
    shell.querySelector('[role="grid"]')?.getBoundingClientRect().width ?? 0
  );

  const clone = block.cloneNode(true) as HTMLElement;

  const grid = clone.querySelector('[role="grid"]');
  if (grid instanceof HTMLElement) {
    grid.style.marginLeft = "0";
    flattenDatabaseGridClone(grid);
  } else {
    // List/board/chart views: still strip hover chrome from the clone.
    for (const el of clone.querySelectorAll(".hover-reveal")) {
      el.remove();
    }
  }

  return {
    node: wrapDatabaseDragPreview(clone, sourceWidth),
    // The card insets the clone by its padding, so the live block's top-left
    // sits one padding step inside the preview's own top-left corner.
    origin: {
      left: blockRect.left - DATABASE_DRAG_PREVIEW_PADDING_PX,
      top: blockRect.top - DATABASE_DRAG_PREVIEW_PADDING_PX,
    },
  };
}

/**
 * Resolves the drag preview for a canvas row: a live element to clone, or a
 * detached card plus the viewport `origin` that keeps the grab point under the
 * pointer. Detached previews can only be rendered by the `overlay` strategy —
 * `setClonedDragImage` in [drag-image.ts](./drag-image.ts) documents why the
 * native drag image cannot place them.
 */
export function resolveCanvasRowDragPreviewSource(
  rowId: string
): CanvasRowDragPreviewSource | null {
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
    return { node: tableGrid };
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
      return { node: canvasContent };
    }
  }

  const tableRow = document.querySelector(
    `[${TABLE_ROW_ATTRIBUTE}="${escapedId}"]`
  );
  return tableRow instanceof HTMLElement ? { node: tableRow } : null;
}
