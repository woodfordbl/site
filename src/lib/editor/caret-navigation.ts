export const CANVAS_FIELD_SELECTOR = "[data-canvas-field]";

export interface FieldSelection {
  end: number;
  start: number;
}

export function isCanvasTextField(
  element: Element | null
): element is HTMLInputElement | HTMLTextAreaElement {
  if (!element) {
    return false;
  }

  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      element.matches(CANVAS_FIELD_SELECTOR))
  );
}

export function findCanvasTextField(
  container: ParentNode
): HTMLInputElement | HTMLTextAreaElement | null {
  const field = container.querySelector(CANVAS_FIELD_SELECTOR);
  return isCanvasTextField(field) ? field : null;
}

export function getFieldSelection(
  element: HTMLInputElement | HTMLTextAreaElement
): FieldSelection {
  const start = element.selectionStart ?? element.value.length;
  const end = element.selectionEnd ?? start;
  return { start, end };
}

export function focusFieldAtSelection(
  element: HTMLInputElement | HTMLTextAreaElement,
  selection: FieldSelection
): void {
  const start = Math.min(selection.start, element.value.length);
  const end = Math.min(selection.end, element.value.length);
  element.focus();
  element.setSelectionRange(start, end);
}

export function shouldNavigateUpFromField(
  element: HTMLInputElement | HTMLTextAreaElement
): boolean {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (start !== end) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return element.value.lastIndexOf("\n", start - 1) === -1;
  }

  return start === 0;
}

export function shouldNavigateDownFromField(
  element: HTMLInputElement | HTMLTextAreaElement
): boolean {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (start !== end) {
    return false;
  }

  if (element instanceof HTMLTextAreaElement) {
    return element.value.indexOf("\n", start) === -1;
  }

  return true;
}

export function focusFieldAtPlacement(
  element: HTMLInputElement | HTMLTextAreaElement,
  placement: "start" | "end"
): void {
  const position = placement === "end" ? element.value.length : 0;
  focusFieldAtSelection(element, { start: position, end: position });
}
