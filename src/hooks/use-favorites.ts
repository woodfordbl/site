import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";

import { localFavoritesCollection } from "@/db/collections/local-collections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import type { LocalFavorite } from "@/lib/schemas/local-favorite.ts";

const SERVER_FAVORITES: LocalFavorite[] = [];

function readLiveFavorites(): LocalFavorite[] {
  if (typeof window === "undefined") {
    return SERVER_FAVORITES;
  }

  return localFavoritesCollection.toArray;
}

function useFavoritesSnapshot(): LocalFavorite[] {
  const liveSnapshotRef = useRef<LocalFavorite[]>(readLiveFavorites());

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    liveSnapshotRef.current = readLiveFavorites();

    const subscription = localFavoritesCollection.subscribeChanges(() => {
      liveSnapshotRef.current = readLiveFavorites();
      onStoreChange();
    });

    if (localFavoritesCollection.isReady()) {
      liveSnapshotRef.current = readLiveFavorites();
      onStoreChange();
    }

    return () => subscription.unsubscribe();
  }, []);

  const getSnapshot = useCallback(() => liveSnapshotRef.current, []);
  const getServerSnapshot = useCallback(() => SERVER_FAVORITES, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Favorited page ids in sidebar order (oldest-added first). */
export function useFavorites(): LocalFavorite[] {
  const isClient = useIsClient();
  const favorites = useFavoritesSnapshot();

  return useMemo(() => {
    if (!isClient) {
      return SERVER_FAVORITES;
    }

    return [...favorites].sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      return left.createdAt.localeCompare(right.createdAt);
    });
  }, [favorites, isClient]);
}

export function useIsFavorite(pageId: string): boolean {
  const favorites = useFavorites();
  return useMemo(
    () => favorites.some((favorite) => favorite.id === pageId),
    [favorites, pageId]
  );
}

/** Mutators for the Favorites collection. SSR-safe (no-ops without a window). */
export function useFavoriteActions() {
  const addFavorite = useCallback((pageId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    if (localFavoritesCollection.toArray.some((item) => item.id === pageId)) {
      return;
    }

    const now = new Date().toISOString();
    const nextOrder =
      localFavoritesCollection.toArray.reduce(
        (max, item) => Math.max(max, item.order),
        -1
      ) + 1;

    localFavoritesCollection.insert({
      id: pageId,
      order: nextOrder,
      createdAt: now,
    });
  }, []);

  const removeFavorite = useCallback((pageId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    if (!localFavoritesCollection.toArray.some((item) => item.id === pageId)) {
      return;
    }
    localFavoritesCollection.delete(pageId);
  }, []);

  const toggleFavorite = useCallback(
    (pageId: string) => {
      const isFavorite = localFavoritesCollection.toArray.some(
        (item) => item.id === pageId
      );
      if (isFavorite) {
        removeFavorite(pageId);
      } else {
        addFavorite(pageId);
      }
    },
    [addFavorite, removeFavorite]
  );

  return { addFavorite, removeFavorite, toggleFavorite };
}
