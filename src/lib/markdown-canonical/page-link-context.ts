/**
 * Injected resolution for page links so the codec never touches the content
 * stores. Absent resolvers fall back to lossless `page:<pageId>` URIs.
 */
export interface PageLinkContext {
  /** Serialize: human label for the link (page title). */
  resolveLabelByPageId?(pageId: string): string | undefined;
  /** Parse: map an internal `.md` href to a page id. */
  resolvePageIdByPath?(href: string): string | undefined;
  /** Serialize: map a page id to the target's relative `.md` path. */
  resolvePathByPageId?(pageId: string): string | undefined;
}
