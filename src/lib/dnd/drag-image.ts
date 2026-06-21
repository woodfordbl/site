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

export interface ClonedDragImageOptions {
  /** Cursor hotspot within the drag image; defaults to the pointer position on `node`. */
  hotspotX?: number;
  hotspotY?: number;
}

/**
 * Uses an off-screen clone of `node` as the native drag image, preserving the
 * dragged element's appearance and live form values. Opt-in alternative to the
 * empty-image + React overlay strategy (prefer overlay in embedded Chromium).
 */
export function setClonedDragImage(
  event: DragEvent,
  node: HTMLElement,
  options: ClonedDragImageOptions = {}
): void {
  if (!event.dataTransfer) {
    return;
  }

  const clone = node.cloneNode(true) as HTMLElement;
  syncFormValues(node, clone);

  const rect = node.getBoundingClientRect();
  const hotspotX = options.hotspotX ?? event.clientX - rect.left;
  const hotspotY = options.hotspotY ?? event.clientY - rect.top;

  Object.assign(clone.style, {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    width: `${rect.width}px`,
    minHeight: `${Math.max(rect.height, CLONE_MIN_HEIGHT_PX)}px`,
    boxSizing: "border-box",
    borderRadius: "var(--radius-lg)",
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.12)",
    opacity: "0.92",
    pointerEvents: "none",
    zIndex: "9999",
  });

  document.body.appendChild(clone);

  event.dataTransfer.setDragImage(clone, hotspotX, hotspotY);

  requestAnimationFrame(() => {
    clone.remove();
  });
}
