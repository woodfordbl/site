import type { Block } from "@/lib/schemas/block.ts";

/**
 * Session-scoped undo/redo history for canvas block edits.
 *
 * One in-memory stack pair per page, kept for the lifetime of the tab so
 * Ctrl+Z can roll back edits made at any point in the local session — across
 * page navigations, long after the browser's native field undo has been lost.
 * Entries hold the page's ordered block list by reference (blocks are treated
 * as immutable by the canvas session), so consecutive entries share unchanged
 * block objects and memory stays proportional to distinct block versions.
 *
 * This complements — not replaces — the IndexedDB snapshot timeline: the
 * timeline persists coarse 10-minute checkpoints across reloads, while this
 * store gives fine-grained transaction-level undo within the session.
 */

/** Hard cap per page; oldest entries drop first. */
export const MAX_EDIT_HISTORY_ENTRIES = 500;

/**
 * Consecutive edits with the same coalesce key (a typing burst in one block)
 * within this window collapse into the burst's first undo entry.
 */
export const EDIT_HISTORY_COALESCE_MS = 1000;

export interface PageEditHistoryEntry {
  /** Ordered flat block list to restore (same shape as `CanvasPageSession.getBlocks()`). */
  blocks: Block[];
}

interface PageEditHistory {
  lastCoalesceKey: string | null;
  lastRecordedAt: number;
  redo: PageEditHistoryEntry[];
  undo: PageEditHistoryEntry[];
}

const histories = new Map<string, PageEditHistory>();

function getHistory(pageId: string): PageEditHistory {
  let history = histories.get(pageId);
  if (!history) {
    history = { undo: [], redo: [], lastCoalesceKey: null, lastRecordedAt: 0 };
    histories.set(pageId, history);
  }
  return history;
}

/** Breaks typing coalescing so the next edit always starts a fresh entry. */
function resetCoalescing(history: PageEditHistory): void {
  history.lastCoalesceKey = null;
  history.lastRecordedAt = 0;
}

/**
 * Records the page's pre-edit block state as an undo entry. Any new edit
 * invalidates the redo stack. A `coalesceKey` marks single-block typing
 * transactions: repeats of the same key inside {@link EDIT_HISTORY_COALESCE_MS}
 * extend the current entry (the burst's first before-state already covers them).
 */
export function recordPageEditHistory(
  pageId: string,
  blocksBefore: Block[],
  options?: { coalesceKey?: string; nowMs?: number }
): void {
  const history = getHistory(pageId);
  const now = options?.nowMs ?? Date.now();

  history.redo = [];

  const coalesceKey = options?.coalesceKey ?? null;
  if (
    coalesceKey !== null &&
    coalesceKey === history.lastCoalesceKey &&
    now - history.lastRecordedAt < EDIT_HISTORY_COALESCE_MS
  ) {
    history.lastRecordedAt = now;
    return;
  }

  history.undo.push({ blocks: blocksBefore });
  if (history.undo.length > MAX_EDIT_HISTORY_ENTRIES) {
    history.undo.splice(0, history.undo.length - MAX_EDIT_HISTORY_ENTRIES);
  }
  history.lastCoalesceKey = coalesceKey;
  history.lastRecordedAt = now;
}

/**
 * Pops the most recent undo entry, pushing `currentBlocks` onto the redo stack
 * so the step can be replayed. Returns null when there is nothing to undo.
 */
export function popPageUndoEntry(
  pageId: string,
  currentBlocks: Block[]
): PageEditHistoryEntry | null {
  const history = getHistory(pageId);
  const entry = history.undo.pop();
  if (!entry) {
    return null;
  }

  history.redo.push({ blocks: currentBlocks });
  resetCoalescing(history);
  return entry;
}

/**
 * Pops the most recent redo entry, pushing `currentBlocks` back onto the undo
 * stack. Returns null when there is nothing to redo.
 */
export function popPageRedoEntry(
  pageId: string,
  currentBlocks: Block[]
): PageEditHistoryEntry | null {
  const history = getHistory(pageId);
  const entry = history.redo.pop();
  if (!entry) {
    return null;
  }

  history.undo.push({ blocks: currentBlocks });
  resetCoalescing(history);
  return entry;
}

/** Drops both stacks for a page (reset-to-remote, page delete). */
export function clearPageEditHistory(pageId: string): void {
  histories.delete(pageId);
}

/** Drops every page's history (reset-all-to-remote). */
export function clearAllPageEditHistories(): void {
  histories.clear();
}
