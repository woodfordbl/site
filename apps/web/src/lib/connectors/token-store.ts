/**
 * Per-connector BYO tokens (e.g. a GitHub fine-grained PAT) in localStorage
 * under one JSON record keyed by connector id.
 *
 * Security posture: tokens are **client-only**. The user types them in, they
 * live in this browser's localStorage, and they are attached to provider
 * requests directly from the browser (`Authorization` header). They are never
 * baked into the bundle, never sent to our server or proxy, and never leave
 * the device by any path we control. Clearing site data deletes them. All
 * functions are SSR-safe no-ops when `window` is unavailable.
 */

const STORAGE_KEY = "site-connector-tokens";

/** Read the token record defensively — corrupt JSON degrades to empty. */
function readTokenRecord(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage blocked (private mode / permissions) — behave as empty.
    return {};
  }
  if (raw === null) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}

/** The stored token for a connector, or `undefined` when none is saved. */
export function getConnectorToken(connectorId: string): string | undefined {
  return readTokenRecord()[connectorId];
}

/**
 * Save (or clear, with an empty/whitespace string) a connector's token.
 * Best-effort: storage write failures are swallowed — the connector simply
 * runs unauthenticated next poll.
 */
export function setConnectorToken(connectorId: string, token: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const record = readTokenRecord();
  const trimmed = token.trim();
  if (trimmed === "") {
    delete record[connectorId];
  } else {
    record[connectorId] = trimmed;
  }
  try {
    if (Object.keys(record).length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    }
  } catch {
    // Storage full/blocked — token entry is best-effort by design.
  }
}
