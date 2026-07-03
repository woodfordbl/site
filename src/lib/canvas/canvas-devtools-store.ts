import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import type { BlockSelectionState } from "@/lib/canvas/block-selection.ts";
import type { FocusState } from "@/lib/canvas/effects.ts";

/**
 * Dev-only bridge between the canvas editor and the devtools panel/overlay,
 * which mount outside the editor's React providers. The editor publishes its
 * volatile state here; publishing is a no-op in production builds.
 */
export interface CanvasDevtoolsState {
  focus: FocusState;
  rows: CanvasRow[];
  selection: BlockSelectionState;
}

let state: CanvasDevtoolsState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function publishCanvasDevtoolsState(
  next: CanvasDevtoolsState | null
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  state = next;
  emit();
}

export function subscribeCanvasDevtools(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCanvasDevtoolsState(): CanvasDevtoolsState | null {
  return state;
}

/** Geometry debug overlay flag, persisted so it survives reloads. */
const OVERLAY_FLAG_KEY = "canvas-debug-overlay";
const OVERLAY_FLAG_EVENT = "canvas-debug-overlay-change";

export function isCanvasDebugOverlayEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(OVERLAY_FLAG_KEY) === "on";
}

export function setCanvasDebugOverlayEnabled(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  if (enabled) {
    window.localStorage.setItem(OVERLAY_FLAG_KEY, "on");
  } else {
    window.localStorage.removeItem(OVERLAY_FLAG_KEY);
  }
  window.dispatchEvent(new Event(OVERLAY_FLAG_EVENT));
}

export function subscribeCanvasDebugOverlay(listener: () => void): () => void {
  window.addEventListener(OVERLAY_FLAG_EVENT, listener);
  return () => {
    window.removeEventListener(OVERLAY_FLAG_EVENT, listener);
  };
}
