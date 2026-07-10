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

export interface ClonedDragImageOptions {
  /** Cursor hotspot within the drag image; defaults to the pointer position on `node`. */
  hotspotX?: number;
  hotspotY?: number;
}

/**
 * Uses an off-screen clone of `node` as the native drag image, preserving the
 * dragged element's appearance and live form values. Opt-in alternative to the
 * empty-image + React overlay strategy (prefer overlay in embedded Chromium).
 *
 * Detached synthetic previews (e.g. sanitized database grid cards) are mounted
 * as-is — they are already the preview, not a live DOM source to clone.
 */
export function setClonedDragImage(
  event: DragEvent,
  node: HTMLElement,
  options: ClonedDragImageOptions = {}
): void {
  if (!event.dataTransfer) {
    return;
  }

  const synthetic = !node.isConnected;
  const sourceRect = synthetic ? null : node.getBoundingClientRect();

  let image: HTMLElement;
  if (synthetic) {
    image = node;
  } else {
    image = node.cloneNode(true) as HTMLElement;
    syncFormValues(node, image);
  }

  Object.assign(image.style, {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    ...(sourceRect
      ? {
          width: `${sourceRect.width}px`,
          minHeight: `${Math.max(sourceRect.height, CLONE_MIN_HEIGHT_PX)}px`,
          backgroundColor: "var(--background)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }
      : {}),
    boxSizing: "border-box",
    opacity: String(CANVAS_ROW_DRAG_PREVIEW_OPACITY),
    pointerEvents: "none",
    zIndex: "9999",
  });

  document.body.appendChild(image);

  const imageRect = image.getBoundingClientRect();
  let hotspotX = options.hotspotX;
  let hotspotY = options.hotspotY;
  if (hotspotX === undefined || hotspotY === undefined) {
    if (sourceRect) {
      hotspotX ??= event.clientX - sourceRect.left;
      hotspotY ??= event.clientY - sourceRect.top;
    } else {
      hotspotX ??= Math.min(24, Math.max(imageRect.width / 2, 0));
      hotspotY ??= Math.min(
        imageRect.height / 2,
        Math.max(imageRect.height - 1, 0)
      );
    }
  }

  event.dataTransfer.setDragImage(image, hotspotX, hotspotY);

  requestAnimationFrame(() => {
    image.remove();
  });
}
