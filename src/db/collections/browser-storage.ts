import { isDevDiskMode } from "@/lib/content/dev-disk/dev-disk-mode.ts";

/** In-memory Storage for SSR and tests — no localStorage access. */
export function createMemoryStorage(): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear(): void {
      store.clear();
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
  };
}

declare global {
  var __siteDevDiskStorage: Storage | undefined;
}

/**
 * Safe on server; returns real localStorage in the browser. In dev disk mode
 * content collections (and every sync shard reader) share ONE in-memory
 * store instead — the repo's `content/` tree is the source of truth and
 * nothing content-shaped may persist in localStorage. The singleton lives on
 * globalThis so HMR of this module never orphans live collections.
 */
export function getBrowserStorage(): Storage {
  if (typeof window === "undefined") {
    return createMemoryStorage();
  }

  if (isDevDiskMode()) {
    globalThis.__siteDevDiskStorage ??= createMemoryStorage();
    return globalThis.__siteDevDiskStorage;
  }

  return window.localStorage;
}
