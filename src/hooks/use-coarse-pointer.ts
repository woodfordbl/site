import { useSyncExternalStore } from "react";

const coarseQuery = "(pointer: coarse)";

function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(coarseQuery);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getSnapshot() {
  return window.matchMedia(coarseQuery).matches;
}

function getServerSnapshot() {
  return false;
}

/**
 * True on touch-primary devices (`pointer: coarse`). Drives the pointer-based
 * drag path for the canvas grip, where native HTML5 drag-and-drop never fires.
 */
export function useCoarsePointer() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
