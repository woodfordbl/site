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

/** Safe on server; returns real localStorage in the browser. */
export function getBrowserStorage(): Storage {
  if (typeof window === "undefined") {
    return createMemoryStorage();
  }

  return window.localStorage;
}
