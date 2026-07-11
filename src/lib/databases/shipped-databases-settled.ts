import { useCallback, useSyncExternalStore } from "react";

/**
 * Tiny module store: has the shipped-database seeding pass finished (or
 * failed) this session? Database blocks on shipped pages gate their table
 * view on it so a first visit never flashes "This database was deleted."
 * while the seed fetch is in flight. SSR snapshot is `false`, so server
 * renders (and the hydration frame) show the placeholder.
 */

let settled = false;
const listeners = new Set<() => void>();

export function markShippedDatabasesSettled(): void {
  if (settled) {
    return;
  }
  settled = true;
  for (const listener of listeners) {
    listener();
  }
}

/** Test-only: reset the once-per-session settled flag. */
export function resetShippedDatabasesSettledForTests(): void {
  settled = false;
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useShippedDatabasesSettled(): boolean {
  const getSnapshot = useCallback(() => settled, []);
  const getServerSnapshot = useCallback(() => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
