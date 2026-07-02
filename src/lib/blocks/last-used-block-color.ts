import { type BlockColor, blockColorSchema } from "@/lib/schemas/rich-text.ts";

/**
 * Remembers the last color the user applied to a block (text and background,
 * tracked independently) so the "apply last color" shortcut (Mod+H) can restyle
 * a fresh selection without opening a menu. Only *real* colors are recorded —
 * choosing "Default" leaves the remembered color intact so the shortcut keeps
 * reapplying the user's chosen highlight.
 *
 * A module-level store (not React state) so both the color menus that write it
 * and the imperative Mod+H handler that reads it share one source, and it can be
 * read at event time. Persisted to localStorage so it survives reloads.
 */

export interface LastUsedBlockColors {
  backgroundColor?: BlockColor;
  color?: BlockColor;
}

const STORAGE_KEY = "canvas:last-used-block-color";

let state: LastUsedBlockColors = {};
let hydrated = false;

function readStorage(): LastUsedBlockColors {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: LastUsedBlockColors = {};
    const color = blockColorSchema.safeParse(parsed.color);
    if (color.success) {
      next.color = color.data;
    }
    const background = blockColorSchema.safeParse(parsed.backgroundColor);
    if (background.success) {
      next.backgroundColor = background.data;
    }
    return next;
  } catch {
    return {};
  }
}

function ensureHydrated(): void {
  if (!hydrated) {
    state = readStorage();
    hydrated = true;
  }
}

/** Snapshot of the last text + background colors the user applied. */
export function getLastUsedBlockColors(): LastUsedBlockColors {
  ensureHydrated();
  return state;
}

/**
 * Record a color the user just applied. `undefined` (the "Default" choice) is
 * ignored so the remembered color survives clearing a block.
 */
export function recordLastUsedBlockColor(
  key: "color" | "backgroundColor",
  color: BlockColor | undefined
): void {
  if (!color) {
    return;
  }
  ensureHydrated();
  state = { ...state, [key]: color };
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota / private-mode write failures — the in-memory value still
      // drives the shortcut for the rest of the session.
    }
  }
}
