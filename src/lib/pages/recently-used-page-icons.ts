import { useSyncExternalStore } from "react";

import { decodePageIcon } from "@/lib/pages/page-icon.ts";

/**
 * Remembers the icons and emojis a user has most recently applied to a page so the
 * picker can surface them in a "Recently used" row at the top of each panel. Emoji
 * and Tabler recents are tracked in separate MRU lists (each panel only shows its own
 * kind), newest first, capped at {@link RECENT_LIMIT}.
 *
 * A module-level store (not React state) so the single selection choke point in the
 * picker can record without prop-drilling, backed by an external-store subscription so
 * panels re-render when it changes. Persisted to localStorage so it survives reloads.
 */

export interface RecentlyUsedPageIcons {
  /** Raw emoji characters, most-recent first. */
  emoji: string[];
  /** `tabler:<name>` strings, most-recent first. */
  tabler: string[];
}

const STORAGE_KEY = "page-icon:recently-used";
/** Kept to a single 8-column row per panel. */
const RECENT_LIMIT = 8;

/** Stable empty reference shared by the server snapshot and unhydrated reads. */
const EMPTY: RecentlyUsedPageIcons = { emoji: [], tabler: [] };

let state: RecentlyUsedPageIcons = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readStorage(): RecentlyUsedPageIcons {
  if (typeof localStorage === "undefined") {
    return EMPTY;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      emoji: readStringList(parsed.emoji).slice(0, RECENT_LIMIT),
      tabler: readStringList(parsed.tabler).slice(0, RECENT_LIMIT),
    };
  } catch {
    return EMPTY;
  }
}

function ensureHydrated(): void {
  if (!hydrated) {
    state = readStorage();
    hydrated = true;
  }
}

/** Move `value` to the front of `list`, de-duplicating, capped at {@link RECENT_LIMIT}. */
function promote(list: string[], value: string): string[] {
  return [value, ...list.filter((entry) => entry !== value)].slice(
    0,
    RECENT_LIMIT
  );
}

/** Snapshot of the user's recently applied emojis and icons. */
export function getRecentlyUsedPageIcons(): RecentlyUsedPageIcons {
  ensureHydrated();
  return state;
}

/**
 * Record an icon the user just applied, routing it to the emoji or Tabler MRU list.
 * The default (empty) icon is ignored so removing an icon leaves recents intact.
 */
export function recordRecentlyUsedPageIcon(rawIcon: string): void {
  const decoded = decodePageIcon(rawIcon);
  if (decoded.kind === "default") {
    return;
  }
  ensureHydrated();
  state =
    decoded.kind === "emoji"
      ? { ...state, emoji: promote(state.emoji, rawIcon) }
      : { ...state, tabler: promote(state.tabler, rawIcon) };

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / private-mode write failures — the in-memory value still
      // drives the picker for the rest of the session.
    }
  }
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Recently used emojis and icons, kept live via an external-store subscription. */
export function useRecentlyUsedPageIcons(): RecentlyUsedPageIcons {
  return useSyncExternalStore(subscribe, getRecentlyUsedPageIcons, () => EMPTY);
}
