import {
  BLOCK_COLLECTION_STORAGE_KEY,
  BLOCK_SHARD_PREFIX,
} from "@/db/collections/page-sharded-block-storage.ts";

type StorageListener = (event: StorageEvent) => void;

function isBlockShardKey(key: string | null): boolean {
  return key?.startsWith(BLOCK_SHARD_PREFIX) ?? false;
}

/**
 * TanStack DB only reloads when `event.key === storageKey` and
 * `event.storageArea === storage`. Shard writes use `site-local-blocks:<pageId>`,
 * so we synthesize a matching event and pass the same Storage instance as config.
 */
export function createBlockShardStorageEventApi(
  blockStorage: Storage,
  onShardStorageChange: () => void
): Pick<Window, "addEventListener" | "removeEventListener"> {
  const storageListeners = new Set<StorageListener>();

  function notifyTanStackListeners(browserEvent: StorageEvent): void {
    if (typeof window === "undefined") {
      return;
    }

    if (browserEvent.storageArea !== window.localStorage) {
      return;
    }

    const key = browserEvent.key;
    if (key !== BLOCK_COLLECTION_STORAGE_KEY && !isBlockShardKey(key)) {
      return;
    }

    onShardStorageChange();

    const synthetic = new StorageEvent("storage", {
      key: BLOCK_COLLECTION_STORAGE_KEY,
      newValue: browserEvent.newValue,
      oldValue: browserEvent.oldValue,
      storageArea: blockStorage,
      url: browserEvent.url,
    });

    for (const listener of storageListeners) {
      listener(synthetic);
    }
  }

  if (typeof window !== "undefined") {
    window.addEventListener("storage", notifyTanStackListeners);
  }

  return {
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      _options?: boolean | AddEventListenerOptions
    ): void {
      if (type !== "storage") {
        return;
      }

      if (typeof listener === "object") {
        return;
      }

      const wrapped: StorageListener = (event) => {
        listener(event);
      };

      storageListeners.add(wrapped);
      (
        listener as StorageListener & { __wrapped?: StorageListener }
      ).__wrapped = wrapped;
    },
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      _options?: boolean | EventListenerOptions
    ): void {
      if (type !== "storage") {
        return;
      }

      if (typeof listener === "object") {
        return;
      }

      const wrapped = (
        listener as StorageListener & { __wrapped?: StorageListener }
      ).__wrapped;
      if (wrapped) {
        storageListeners.delete(wrapped);
      }
    },
  };
}
