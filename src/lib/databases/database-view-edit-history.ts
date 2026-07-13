import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { restoreDatabaseView } from "@/db/queries/database-collection-ops.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

/**
 * Session-scoped undo/redo for saved-view option edits (filters, hidden
 * groups, etc.). Complements canvas block history: Ctrl+Z picks whichever
 * domain recorded the more recent edit.
 */

/** Hard cap per database view; oldest entries drop first. */
export const MAX_DATABASE_VIEW_EDIT_HISTORY_ENTRIES = 200;

export interface DatabaseViewEditHistoryEntry {
  view: DatabaseView;
}

interface DatabaseViewEditHistory {
  lastRecordedAt: number;
  redo: DatabaseViewEditHistoryEntry[];
  undo: DatabaseViewEditHistoryEntry[];
}

const histories = new Map<string, DatabaseViewEditHistory>();

let lastEditedKey: string | null = null;
let lastEditedAt = 0;

export type SessionUndoKind = "database-view" | "page-blocks";

let lastUndoKind: SessionUndoKind | null = null;

function viewHistoryKey(databaseId: string, viewId: string): string {
  return `${databaseId}:${viewId}`;
}

function cloneView(view: DatabaseView): DatabaseView {
  return JSON.parse(JSON.stringify(view)) as DatabaseView;
}

function getHistory(key: string): DatabaseViewEditHistory {
  let history = histories.get(key);
  if (!history) {
    history = { undo: [], redo: [], lastRecordedAt: 0 };
    histories.set(key, history);
  }
  return history;
}

function parseHistoryKey(key: string): { databaseId: string; viewId: string } {
  const separatorIndex = key.indexOf(":");
  return {
    databaseId: key.slice(0, separatorIndex),
    viewId: key.slice(separatorIndex + 1),
  };
}

function resolveCurrentView(
  key: string
): { databaseId: string; view: DatabaseView } | null {
  const { databaseId, viewId } = parseHistoryKey(key);
  const database = localDatabasesCollection.get(databaseId);
  const view = database?.views.find((entry) => entry.id === viewId);
  if (!view) {
    return null;
  }
  return { databaseId, view };
}

/** Timestamp of the most recent recorded database-view edit (any view). */
export function getLastDatabaseViewEditRecordedAt(): number {
  return lastEditedAt;
}

/** View key (`databaseId:viewId`) touched by the latest recorded edit. */
export function getLastDatabaseViewEditKey(): string | null {
  return lastEditedKey;
}

/** Which domain last handled an undo — drives the next redo target. */
export function getLastSessionUndoKind(): SessionUndoKind | null {
  return lastUndoKind;
}

export function markSessionUndoKind(kind: SessionUndoKind): void {
  lastUndoKind = kind;
}

export function clearSessionUndoKind(): void {
  lastUndoKind = null;
}

/**
 * Records the view's pre-edit snapshot. Any new edit invalidates that view's
 * redo stack and clears the session redo target.
 */
export function recordDatabaseViewEditHistory(
  databaseId: string,
  viewBefore: DatabaseView,
  options?: { nowMs?: number }
): void {
  const key = viewHistoryKey(databaseId, viewBefore.id);
  const history = getHistory(key);
  const now = options?.nowMs ?? Date.now();

  history.redo = [];
  history.undo.push({ view: cloneView(viewBefore) });
  if (history.undo.length > MAX_DATABASE_VIEW_EDIT_HISTORY_ENTRIES) {
    history.undo.splice(
      0,
      history.undo.length - MAX_DATABASE_VIEW_EDIT_HISTORY_ENTRIES
    );
  }
  history.lastRecordedAt = now;
  lastEditedKey = key;
  lastEditedAt = now;
  lastUndoKind = null;
}

export function popDatabaseViewUndoEntry(
  key: string,
  currentView: DatabaseView
): DatabaseView | null {
  const history = histories.get(key);
  const entry = history?.undo.pop();
  if (!(entry && history)) {
    return null;
  }

  history.redo.push({ view: cloneView(currentView) });
  return entry.view;
}

export function popDatabaseViewRedoEntry(
  key: string,
  currentView: DatabaseView
): DatabaseView | null {
  const history = histories.get(key);
  const entry = history?.redo.pop();
  if (!(entry && history)) {
    return null;
  }

  history.undo.push({ view: cloneView(currentView) });
  return entry.view;
}

/** Restores the most recent database-view undo entry when one exists. */
export function tryUndoDatabaseViewEdit(): boolean {
  const key = lastEditedKey;
  if (!key) {
    return false;
  }
  const resolved = resolveCurrentView(key);
  if (!resolved) {
    return false;
  }

  const restored = popDatabaseViewUndoEntry(key, resolved.view);
  if (!restored) {
    return false;
  }

  restoreDatabaseView(resolved.databaseId, restored);
  lastUndoKind = "database-view";
  return true;
}

/** Replays the most recent database-view redo entry when one exists. */
export function tryRedoDatabaseViewEdit(): boolean {
  const key = lastEditedKey;
  if (!key) {
    return false;
  }
  const resolved = resolveCurrentView(key);
  if (!resolved) {
    return false;
  }

  const restored = popDatabaseViewRedoEntry(key, resolved.view);
  if (!restored) {
    return false;
  }

  restoreDatabaseView(resolved.databaseId, restored);
  lastUndoKind = "database-view";
  return true;
}

/** Drops both stacks for one view (database delete, view delete). */
export function clearDatabaseViewEditHistory(
  databaseId: string,
  viewId: string
): void {
  const key = viewHistoryKey(databaseId, viewId);
  histories.delete(key);
  if (lastEditedKey === key) {
    lastEditedKey = null;
    lastEditedAt = 0;
  }
}

/** Drops every view's history (workspace reset). */
export function clearAllDatabaseViewEditHistories(): void {
  histories.clear();
  lastEditedKey = null;
  lastEditedAt = 0;
  lastUndoKind = null;
}
