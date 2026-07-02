import {
  getRichTextSelection,
  serializeRichTextDom,
  setRichTextSelection,
} from "@/lib/editor/rich-text-dom.ts";

export const CANVAS_FIELD_SELECTOR = "[data-canvas-field]";

export interface FieldSelection {
  end: number;
  start: number;
}

/**
 * A canvas-editable field: a plain `<input>`/`<textarea>` or the rich-text
 * contenteditable surface. All caret helpers speak `FieldSelection` character
 * offsets regardless of the underlying element.
 */
export type CanvasField = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

export function isRichTextField(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.matches(CANVAS_FIELD_SELECTOR) &&
    element.hasAttribute("contenteditable")
  );
}

export function isCanvasTextField(
  element: Element | null
): element is CanvasField {
  if (!element) {
    return false;
  }

  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      element.matches(CANVAS_FIELD_SELECTOR)) ||
    isRichTextField(element)
  );
}

export function findCanvasTextField(container: ParentNode): CanvasField | null {
  const field = container.querySelector(CANVAS_FIELD_SELECTOR);
  return isCanvasTextField(field) ? field : null;
}

function isNativeField(
  field: CanvasField
): field is HTMLInputElement | HTMLTextAreaElement {
  return (
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
  );
}

/** The field's plain-text value (rich fields serialize their DOM). */
export function getFieldValue(field: CanvasField): string {
  if (isNativeField(field)) {
    return field.value;
  }
  return serializeRichTextDom(field).text;
}

export function getFieldSelection(field: CanvasField): FieldSelection {
  if (isNativeField(field)) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    return { start, end };
  }
  const selection = getRichTextSelection(field);
  if (selection) {
    return selection;
  }
  const length = getFieldValue(field).length;
  return { start: length, end: length };
}

export function focusFieldAtSelection(
  field: CanvasField,
  selection: FieldSelection
): void {
  const length = getFieldValue(field).length;
  const start = Math.min(selection.start, length);
  const end = Math.min(selection.end, length);
  field.focus();
  if (isNativeField(field)) {
    field.setSelectionRange(start, end);
    return;
  }
  setRichTextSelection(field, { start, end });
}

export function shouldNavigateUpFromField(field: CanvasField): boolean {
  const { start, end } = getFieldSelection(field);
  if (start !== end) {
    return false;
  }

  if (field instanceof HTMLInputElement) {
    return start === 0;
  }

  return getFieldValue(field).lastIndexOf("\n", start - 1) === -1;
}

export function shouldNavigateDownFromField(field: CanvasField): boolean {
  const { start, end } = getFieldSelection(field);
  if (start !== end) {
    return false;
  }

  if (field instanceof HTMLInputElement) {
    return true;
  }

  return getFieldValue(field).indexOf("\n", start) === -1;
}

export function focusFieldAtPlacement(
  field: CanvasField,
  placement: "start" | "end"
): void {
  const position = placement === "end" ? getFieldValue(field).length : 0;
  focusFieldAtSelection(field, { start: position, end: position });
}
