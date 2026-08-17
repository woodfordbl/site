/**
 * Typed wrapper around a single HTML5 drag MIME type.
 * Each drag surface owns one channel so payloads never cross surfaces.
 */
export interface DragChannel {
  readonly mimeType: string;
  read(dataTransfer: DataTransfer): string | null;
  write(dataTransfer: DataTransfer, id: string): void;
}

/**
 * Clears browser-default drag payloads (e.g. `text/uri-list`) so Chromium does not paint
 * the link "globe" badge on top of a custom drag preview.
 */
export function prepareDataTransferForMove(
  dataTransfer: DataTransfer,
  mimeType: string,
  id: string
): void {
  for (const type of [...dataTransfer.types]) {
    dataTransfer.clearData(type);
  }
  dataTransfer.setData(mimeType, id);
  dataTransfer.effectAllowed = "move";
}

/**
 * Creates a {@link DragChannel} for a custom MIME type (e.g. `application/x-page-id`).
 * Generalizes the per-surface `set*DragData`/`get*DragId` helpers.
 */
export function createDragChannel(mimeType: string): DragChannel {
  return {
    mimeType,
    write(dataTransfer, id) {
      prepareDataTransferForMove(dataTransfer, mimeType, id);
    },
    read(dataTransfer) {
      const value = dataTransfer.getData(mimeType);
      return value.length > 0 ? value : null;
    },
  };
}
