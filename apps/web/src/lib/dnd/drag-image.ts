import { CANVAS_FIELD_SELECTOR } from "@/lib/editor/caret-navigation.ts";

/**
 * Hides the native drag chip so a surface can render its own React overlay.
 * Uses a 1×1 node attached to `document.body` — detached canvases are ignored
 * in embedded Chromium (e.g. Cursor), which then falls back to the link globe.
 */
export function setEmptyDragImage(event: DragEvent): void {
  if (!event.dataTransfer) {
    return;
  }

  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  event.dataTransfer.setDragImage(host, 0, 0);
  requestAnimationFrame(() => {
    host.remove();
  });
}

/**
 * Deep-clones `node` and copies live `[data-canvas-field]` input/textarea
 * values (which `cloneNode`/`outerHTML` drop) so a rendered preview shows the
 * dragged block's text rather than an empty box.
 */
export function cloneNodeWithFieldValues(node: HTMLElement): HTMLElement {
  const clone = node.cloneNode(true) as HTMLElement;
  syncFormValues(node, clone);
  return clone;
}

/** Resolve a pointer hotspot relative to a preview, optionally clamped. */
export function resolveDragPreviewOffset(
  pointer: { x: number; y: number },
  previewRect: { height: number; left: number; top: number; width: number },
  options: {
    clamp?: boolean;
    origin?: { left: number; top: number };
  } = {}
): { x: number; y: number } {
  const anchor = options.origin ?? previewRect;
  const x = pointer.x - anchor.left;
  const y = pointer.y - anchor.top;
  return options.clamp
    ? {
        x: Math.min(x, previewRect.width),
        y: Math.min(y, previewRect.height),
      }
    : { x, y };
}

function syncFormValues(source: Element, clone: Element): void {
  const sourceFields = source.querySelectorAll(CANVAS_FIELD_SELECTOR);
  const cloneFields = clone.querySelectorAll(CANVAS_FIELD_SELECTOR);

  for (let index = 0; index < sourceFields.length; index += 1) {
    const sourceField = sourceFields[index];
    const cloneField = cloneFields[index];

    if (
      sourceField instanceof HTMLTextAreaElement &&
      cloneField instanceof HTMLTextAreaElement
    ) {
      cloneField.value = sourceField.value;
    } else if (
      sourceField instanceof HTMLInputElement &&
      cloneField instanceof HTMLInputElement
    ) {
      cloneField.value = sourceField.value;
    }
  }
}

const CLONE_MIN_HEIGHT_PX = 32;

/** Shared opacity for canvas block drag previews (native clone + touch overlay). */
export const CANVAS_ROW_DRAG_PREVIEW_OPACITY = 0.5;

/**
 * Uses an off-screen clone of `node` as the native drag image, preserving the
 * dragged element's appearance and live form values. Opt-in alternative to the
 * empty-image + React overlay strategy (prefer overlay in embedded Chromium).
 *
 * **`node` must be connected and must not have layered descendants that
 * overflow its top-left.** Chromium rasterizes an element drag image over
 * `AbsoluteBoundingBoxRectIncludingDescendants()` — the union of every
 * positioned descendant's border box, which `overflow: hidden` does *not*
 * shrink — and reads the hotspot from that union's origin, not the node's. A
 * descendant bleeding left (the database grid's negative scrollport margins)
 * therefore shifts the ghost by a constant no hotspot can cancel. Surfaces with
 * such previews use the `overlay` strategy instead, which positions the preview
 * itself.
 */
export function setClonedDragImage(event: DragEvent, node: HTMLElement): void {
  if (!event.dataTransfer) {
    return;
  }

  const sourceRect = node.getBoundingClientRect();
  const image = cloneNodeWithFieldValues(node);

  Object.assign(image.style, {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    width: `${sourceRect.width}px`,
    minHeight: `${Math.max(sourceRect.height, CLONE_MIN_HEIGHT_PX)}px`,
    backgroundColor: "var(--background)",
    borderRadius: "var(--radius-lg)",
    overflow: "hidden",
    boxSizing: "border-box",
    opacity: String(CANVAS_ROW_DRAG_PREVIEW_OPACITY),
    pointerEvents: "none",
    zIndex: "9999",
  });

  document.body.appendChild(image);

  // Negative when the grab handle sits outside the row content (the canvas
  // gutter), which draws the ghost over the row it came from.
  const offset = resolveDragPreviewOffset(
    { x: event.clientX, y: event.clientY },
    sourceRect
  );
  event.dataTransfer.setDragImage(image, offset.x, offset.y);

  requestAnimationFrame(() => {
    image.remove();
  });
}
