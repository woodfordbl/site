/**
 * Echo suppression for dev disk mode. Every flush records the written file's
 * content hash (returned by `savePage`); when the content watcher broadcasts
 * a change whose hash matches a recent own write, the client ignores it —
 * the working copy is already ahead of that event.
 */

const TTL_MS = 5000;
const MAX_ENTRIES = 100;

const recentWrites = new Map<string, number>();

export function recordOwnWrite(contentHash: string): void {
  recentWrites.set(contentHash, Date.now());
  if (recentWrites.size > MAX_ENTRIES) {
    const oldest = recentWrites.keys().next().value;
    if (oldest !== undefined) {
      recentWrites.delete(oldest);
    }
  }
}

export function isOwnWrite(contentHash: string): boolean {
  const at = recentWrites.get(contentHash);
  if (at === undefined) {
    return false;
  }
  if (Date.now() - at > TTL_MS) {
    recentWrites.delete(contentHash);
    return false;
  }
  return true;
}
