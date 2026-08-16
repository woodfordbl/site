import { useSyncExternalStore } from "react";

/**
 * Global gate that suppresses command-hotkey dispatch while the settings
 * recorder is capturing a new combo. Without this, pressing the new combo would
 * both record it *and* fire the command it collides with. A module-level store
 * keeps it provider-free so any `useCommandHotkeys` call (anywhere in the tree)
 * and the settings recorder share one flag.
 */

let recordingCount = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Mark recording as active/inactive. Reference-counted so concurrent recorders
 * (shouldn't happen, but cheap to be safe) don't clobber each other.
 */
export function setHotkeyRecording(active: boolean): void {
  recordingCount = Math.max(0, recordingCount + (active ? 1 : -1));
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return recordingCount > 0;
}

/** Reactively read whether a hotkey recording is in progress. */
export function useIsHotkeyRecording(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
