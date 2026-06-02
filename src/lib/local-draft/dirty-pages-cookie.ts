export const DIRTY_PAGES_COOKIE_NAME = "site-local-dirty";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function parseDirtyPageIds(value: string | undefined): Set<string> {
  if (!value || value.trim() === "") {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  );
}

export function serializeDirtyPageIds(ids: Iterable<string>): string {
  return [...ids].sort().join(",");
}

export function pageHasLocalDraft(
  pageId: string,
  ids: Set<string> = new Set()
): boolean {
  return ids.has(pageId);
}

export function hasAnyLocalDrafts(ids: Set<string> = new Set()): boolean {
  return ids.size > 0;
}

function readCookieValueFromDocument(name: string): string | undefined {
  if (typeof document === "undefined") {
    return;
  }

  const prefix = `${name}=`;
  const cookies = document.cookie.split(";");

  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }

  return;
}

function writeDocumentCookie(name: string, value: string | null): void {
  if (typeof document === "undefined") {
    return;
  }

  if (value === null) {
    // biome-ignore lint/suspicious/noDocumentCookie: SSR hint cookie, not auth; client must write on edit
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
    return;
  }

  const encoded = encodeURIComponent(value);
  // biome-ignore lint/suspicious/noDocumentCookie: SSR hint cookie, not auth; client must write on edit
  document.cookie = `${name}=${encoded}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
}

export function readDirtyPageIdsFromDocument(): Set<string> {
  return parseDirtyPageIds(
    readCookieValueFromDocument(DIRTY_PAGES_COOKIE_NAME)
  );
}

export function writeDirtyPageIdsToDocument(ids: Set<string>): void {
  if (ids.size === 0) {
    writeDocumentCookie(DIRTY_PAGES_COOKIE_NAME, null);
    return;
  }

  writeDocumentCookie(DIRTY_PAGES_COOKIE_NAME, serializeDirtyPageIds(ids));
}

export function markPageDirty(pageId: string): void {
  const ids = readDirtyPageIdsFromDocument();
  if (ids.has(pageId)) {
    return;
  }

  ids.add(pageId);
  writeDirtyPageIdsToDocument(ids);
}

export function markPageClean(pageId: string): void {
  const ids = readDirtyPageIdsFromDocument();
  if (!ids.has(pageId)) {
    return;
  }

  ids.delete(pageId);
  writeDirtyPageIdsToDocument(ids);
}
