import { CANVAS_FIELD_SELECTOR } from "@/lib/editor/caret-navigation.ts";

function syncFormValues(source: Element, target: Element): void {
  const sourceFields = source.querySelectorAll(CANVAS_FIELD_SELECTOR);
  const targetFields = target.querySelectorAll(CANVAS_FIELD_SELECTOR);

  for (let index = 0; index < sourceFields.length; index++) {
    const sourceField = sourceFields[index];
    const targetField = targetFields[index];

    if (
      sourceField instanceof HTMLTextAreaElement &&
      targetField instanceof HTMLTextAreaElement
    ) {
      targetField.value = sourceField.value;
    } else if (
      sourceField instanceof HTMLInputElement &&
      targetField instanceof HTMLInputElement
    ) {
      targetField.value = sourceField.value;
    }
  }
}

export function setCanvasRowDragImage(event: DragEvent, rowId: string): void {
  if (!event.dataTransfer) {
    return;
  }

  const rowShell = document.querySelector(`[data-canvas-row-id="${rowId}"]`);
  const content = rowShell?.querySelector("[data-canvas-row-content]");
  if (!(content instanceof HTMLElement)) {
    return;
  }

  const ghost = content.cloneNode(true) as HTMLElement;
  syncFormValues(content, ghost);

  const contentRect = content.getBoundingClientRect();
  const minHeight = 32;
  Object.assign(ghost.style, {
    position: "fixed",
    top: "-10000px",
    left: "-10000px",
    width: `${contentRect.width}px`,
    minHeight: `${Math.max(contentRect.height, minHeight)}px`,
    boxSizing: "border-box",
    borderRadius: "var(--radius-lg)",
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.12)",
    opacity: "0.92",
    pointerEvents: "none",
    zIndex: "9999",
  });

  document.body.appendChild(ghost);

  const offsetX = event.clientX - contentRect.left;
  const offsetY = event.clientY - contentRect.top;

  event.dataTransfer.setDragImage(ghost, offsetX, offsetY);

  requestAnimationFrame(() => {
    ghost.remove();
  });
}
