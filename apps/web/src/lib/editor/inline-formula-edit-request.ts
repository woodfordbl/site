/**
 * "Open the formula editor on this token" as a DOM event.
 *
 * An event rather than a context: the senders (the slash handler, the `{{`
 * trigger in the editable surface) and the receiver (the popover mounted
 * beside the canvas) are siblings with no shared owner short of the canvas
 * root, and threading a callback through every layer between them would be
 * far more plumbing than one message is worth.
 */

export const INLINE_FORMULA_EDIT_EVENT = "inline-formula:edit";

export interface InlineFormulaEditRequest {
  /** The token's model offset in its block's text. */
  offset: number;
  rowId: string;
}

export function requestInlineFormulaEdit(rowId: string, offset: number): void {
  document.dispatchEvent(
    new CustomEvent<InlineFormulaEditRequest>(INLINE_FORMULA_EDIT_EVENT, {
      detail: { offset, rowId },
    })
  );
}

/**
 * The same request addressed by field rather than row id. Does nothing when
 * the field is not in a canvas row — a database cell has no row to edit and
 * no popover listening.
 */
export function requestInlineFormulaEditInField(
  field: HTMLElement,
  offset: number
): void {
  const rowId = field
    .closest("[data-canvas-row-id]")
    ?.getAttribute("data-canvas-row-id");
  if (rowId) {
    requestInlineFormulaEdit(rowId, offset);
  }
}
