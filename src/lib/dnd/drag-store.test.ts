import { describe, expect, it, vi } from "vitest";
import { createDragStore } from "@/lib/dnd/drag-store.ts";

describe("createDragStore", () => {
  it("starts idle", () => {
    const store = createDragStore<string>();
    expect(store.getSnapshot()).toEqual({
      draggingId: null,
      pointer: null,
      dropTarget: null,
    });
  });

  it("notifies subscribers on state changes", () => {
    const store = createDragStore<string>();
    const listener = vi.fn();
    store.subscribe(listener);

    store.startDrag("a", { x: 1, y: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({
      draggingId: "a",
      pointer: { x: 1, y: 2 },
      dropTarget: null,
    });
  });

  it("returns a stable snapshot reference until mutated", () => {
    const store = createDragStore<string>();
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    store.startDrag("a", { x: 0, y: 0 });
    expect(store.getSnapshot()).not.toBe(first);
  });

  it("ignores setPointer when no drag is active", () => {
    const store = createDragStore<string>();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setPointer({ x: 5, y: 5 });
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot().pointer).toBeNull();
  });

  it("skips redundant dropTarget updates", () => {
    const store = createDragStore<string>();
    store.startDrag("a", { x: 0, y: 0 });
    const listener = vi.fn();
    store.subscribe(listener);

    store.setDropTarget("t1");
    store.setDropTarget("t1");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("resets to idle on endDrag", () => {
    const store = createDragStore<string>();
    store.startDrag("a", { x: 1, y: 1 });
    store.setDropTarget("t1");

    store.endDrag();
    expect(store.getSnapshot()).toEqual({
      draggingId: null,
      pointer: null,
      dropTarget: null,
    });
  });

  it("stops notifying after unsubscribe", () => {
    const store = createDragStore<string>();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.startDrag("a", { x: 0, y: 0 });
    expect(listener).not.toHaveBeenCalled();
  });
});
