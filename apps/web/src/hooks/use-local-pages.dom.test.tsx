/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useLocalPages } from "@/hooks/use-local-pages.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/**
 * @fileoverview Where local pages come from once the collection has hydrated.
 *
 * The cookie preview and the mount-time storage read exist to cover the window
 * before the collection is ready. Merging them back in afterwards resurrected
 * every hard-deleted page — the merge resolves per id, and a user page that is
 * deleted rather than tombstoned leaves no id behind to win with — so a
 * long-lived surface kept listing pages that were gone until the next reload.
 */

const store = vi.hoisted(() => ({
  bootstrap: [] as LocalPage[],
  collection: [] as LocalPage[],
  listeners: new Set<() => void>(),
  ready: true,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouteContext: () => ({ localPagePreview: [] }),
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localPagesCollection: {
    isReady: () => store.ready,
    subscribeChanges: (listener: () => void) => {
      store.listeners.add(listener);
      return { unsubscribe: () => store.listeners.delete(listener) };
    },
    get toArray() {
      return store.collection;
    },
  },
}));

vi.mock("@/db/collections/read-local-storage-sync.ts", () => ({
  readLocalStorageCollection: () => store.bootstrap,
}));

vi.mock("@/hooks/use-is-client.ts", () => ({ useIsClient: () => true }));

function page(id: string): LocalPage {
  return {
    id,
    slug: `/${id}`,
    title: id,
    parentId: null,
    serverBaselineHash: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as LocalPage;
}

/** Hard-delete: the collection drops the row and rewrites storage. */
function deletePages(remaining: LocalPage[]): void {
  store.collection = remaining;
  store.bootstrap = remaining;
  act(() => {
    for (const listener of store.listeners) {
      listener();
    }
  });
}

beforeEach(() => {
  store.bootstrap = [];
  store.collection = [];
  store.listeners.clear();
  store.ready = true;
});

describe("useLocalPages", () => {
  it("does not resurrect a page the collection has deleted", () => {
    // What clearing a database's row pages does.
    store.bootstrap = [page("keep"), page("row-page")];
    store.collection = [page("keep"), page("row-page")];
    const { result } = renderHook(() => useLocalPages());
    expect(result.current.map((entry) => entry.id)).toEqual([
      "keep",
      "row-page",
    ]);

    deletePages([page("keep")]);

    expect(result.current.map((entry) => entry.id)).toEqual(["keep"]);
  });

  it("reports nothing once the last local page is gone", () => {
    store.bootstrap = [page("only")];
    store.collection = [page("only")];
    const { result } = renderHook(() => useLocalPages());

    deletePages([]);

    expect(result.current).toEqual([]);
  });

  it("falls back to storage while the collection is still hydrating", () => {
    // The window this fallback exists for: ready, but not yet populated.
    store.ready = true;
    store.bootstrap = [page("stored")];
    store.collection = [];

    const { result } = renderHook(() => useLocalPages());

    expect(result.current.map((entry) => entry.id)).toEqual(["stored"]);
  });

  it("uses storage before the collection reports ready", () => {
    store.ready = false;
    store.bootstrap = [page("stored")];
    store.collection = [];

    const { result } = renderHook(() => useLocalPages());

    expect(result.current.map((entry) => entry.id)).toEqual(["stored"]);
  });
});
