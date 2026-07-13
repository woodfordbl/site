/** Stable Sonner toast ids — one visible toast per semantic action. */

export const TOAST_ID_COPY_LINK = "copy-link";
export const TOAST_ID_COPY_LINK_ERROR = "copy-link-error";

export const TOAST_ID_COPY_IMAGE = "copy-image";
export const TOAST_ID_COPY_IMAGE_ERROR = "copy-image-error";

export const TOAST_ID_SAVE_TEMPLATE = "save-template";
export const TOAST_ID_SAVE_TEMPLATE_ERROR = "save-template-error";

export const TOAST_ID_EXPORT_PAGE = "export-page";
export const TOAST_ID_EXPORT_PAGE_ERROR = "export-page-error";

export const TOAST_ID_EXPORT_MARKDOWN = "export-markdown";
export const TOAST_ID_EXPORT_MARKDOWN_ERROR = "export-markdown-error";

export const TOAST_ID_IMPORT_MARKDOWN = "import-markdown";
export const TOAST_ID_IMPORT_MARKDOWN_ERROR = "import-markdown-error";

export const TOAST_ID_MERGE_STALE = "merge-stale";
export const TOAST_ID_MERGE_STALE_NO_BASELINE = "merge-stale-no-baseline";

export const TOAST_ID_RESTORE_SNAPSHOT = "restore-snapshot";
export const TOAST_ID_RESTORE_SNAPSHOT_MISSING = "restore-snapshot-missing";

export const TOAST_ID_ROW_HIDDEN_BY_FILTER = "row-hidden-by-filter";

export const TOAST_ID_COPY_TEMPLATE_TOKEN = "copy-template-token";
export const TOAST_ID_COPY_TEMPLATE_TOKEN_ERROR = "copy-template-token-error";

export const TOAST_ID_PERSISTENCE_ERROR = "persistence-error";

export function orphanLocalPageToastId(pageId: string): string {
  return `orphan-local-page:${pageId}`;
}
