import type { z } from "zod";

interface StoredItem<T> {
  data: T;
  versionKey: string;
}

function readStoredCollection<T>(
  storageKey: string,
  schema: z.ZodType<T>
): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as Record<string, StoredItem<unknown>>;
    const items: T[] = [];

    for (const stored of Object.values(parsed)) {
      const result = schema.safeParse(stored.data);
      if (result.success) {
        items.push(result.data);
      }
    }

    return items;
  } catch {
    return [];
  }
}

export function readLocalStorageCollection<T>(
  storageKey: string,
  schema: z.ZodType<T>
): T[] {
  return readStoredCollection(storageKey, schema);
}
