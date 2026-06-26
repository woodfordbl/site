import {
  createContext,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";

import type { DragChannel } from "@/lib/dnd/drag-channel.ts";
import { setClonedDragImage, setEmptyDragImage } from "@/lib/dnd/drag-image.ts";
import {
  createDragStore,
  type DragPointer,
  type DragStore,
} from "@/lib/dnd/drag-store.ts";
import { collectRects } from "@/lib/dnd/rects.ts";

/** Drag-image strategy: hide the native chip (overlay) or clone a DOM node. */
export type DragImageStrategy =
  | { kind: "overlay" }
  | { kind: "native-clone"; getNode: (sourceId: string) => HTMLElement | null };

export interface DndSurfaceConfig<TDropTarget> {
  channel: DragChannel;
  /** Optional drop-geometry snapshot; defaults to {@link collectRects} on `rowAttribute`. */
  collectDropRects?: () => Map<string, DOMRect>;
  dragImage?: DragImageStrategy;
  onDragEnd?: () => void;
  onDragStart?: (args: {
    sourceId: string;
    pointer: DragPointer;
    /** True when initiated by the pointer-event (touch) path rather than native DnD. */
    pointerDrag: boolean;
  }) => void;
  onDrop: (args: {
    sourceId: string;
    target: TDropTarget;
    pointer: DragPointer;
  }) => void;
  /** Chooses drag image per source; falls back to `dragImage` when omitted or undefined. */
  resolveDragImage?: (sourceId: string) => DragImageStrategy | undefined;
  resolveDropTarget: (args: {
    sourceId: string;
    pointer: DragPointer;
    rects: Map<string, DOMRect>;
  }) => TDropTarget | null;
  /** Attribute used to snapshot row rects at drag start when `collectDropRects` is omitted. */
  rowAttribute: string;
}

export interface DndContextValue<TDropTarget> {
  beginDrag: (sourceId: string, pointer: DragPointer, event: DragEvent) => void;
  /** Pointer-event (touch) drag start — no `dataTransfer`, driven via `movePointer`. */
  beginPointerDrag: (sourceId: string, pointer: DragPointer) => void;
  cancelDrag: () => void;
  channel: DragChannel;
  clearDropTarget: () => void;
  commitDrop: (event: DragEvent) => void;
  /** Commit a pointer-event (touch) drag using the current store snapshot. */
  commitPointerDrop: () => void;
  movePointer: (pointer: DragPointer) => void;
  store: DragStore<TDropTarget>;
}

export const DndContext = createContext<DndContextValue<unknown> | null>(null);

/** Nearest scrollable ancestor — drives edge auto-scroll during a pointer drag. */
function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
  let node = start?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function applyDragImage(
  strategy: DragImageStrategy | undefined,
  sourceId: string,
  event: DragEvent
): void {
  if (strategy?.kind === "native-clone") {
    const node = strategy.getNode(sourceId);
    if (node) {
      setClonedDragImage(event, node);
      return;
    }
  }

  setEmptyDragImage(event);
}

/**
 * Provides one drag surface: owns its transient {@link DragStore}, caches row
 * rects at drag start, batches pointer updates with rAF, and resolves drop
 * targets via the surface's domain logic.
 * @see docs/architecture/drag-and-drop.md
 */
export function DndSurface<TDropTarget>({
  config,
  children,
}: {
  config: DndSurfaceConfig<TDropTarget>;
  children: ReactNode;
}) {
  const storeRef = useRef<DragStore<TDropTarget> | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createDragStore<TDropTarget>();
  }
  const store = storeRef.current;

  const configRef = useRef(config);
  configRef.current = config;

  const rectsRef = useRef<Map<string, DOMRect>>(new Map());
  const rafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<DragPointer | null>(null);
  const pendingResolveRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const value = useMemo<DndContextValue<TDropTarget>>(() => {
    const refreshRects = () => {
      rectsRef.current =
        configRef.current.collectDropRects?.() ??
        collectRects(configRef.current.rowAttribute);
    };

    // Scroll/resize fire per frame during drag-scroll; re-measuring every row
    // synchronously per event thrashes layout. One refresh per frame is enough.
    let rectRefreshFrame: number | null = null;
    const scheduleRectRefresh = () => {
      if (rectRefreshFrame != null) {
        return;
      }
      rectRefreshFrame = requestAnimationFrame(() => {
        rectRefreshFrame = null;
        refreshRects();
      });
    };

    // Edge auto-scroll for the pointer (touch) drag path — the native dragover
    // path gets this from the browser for free, but pointer drags must drive the
    // nearest scroll container themselves so rows past the fold stay reachable.
    const AUTO_SCROLL_EDGE_PX = 72;
    const AUTO_SCROLL_MAX_SPEED_PX = 16;
    let autoScrollFrame: number | null = null;
    let autoScrollContainer: HTMLElement | null = null;

    const stopAutoScroll = () => {
      if (autoScrollFrame != null) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
      }
      autoScrollContainer = null;
    };

    const runAutoScroll = () => {
      autoScrollFrame = requestAnimationFrame(runAutoScroll);
      const container = autoScrollContainer;
      const pointer = store.getSnapshot().pointer;
      if (!(container && pointer)) {
        return;
      }
      const rect = container.getBoundingClientRect();
      let speed = 0;
      if (pointer.y < rect.top + AUTO_SCROLL_EDGE_PX) {
        const intrusion = rect.top + AUTO_SCROLL_EDGE_PX - pointer.y;
        speed = -Math.min(AUTO_SCROLL_MAX_SPEED_PX, intrusion / 4);
      } else if (pointer.y > rect.bottom - AUTO_SCROLL_EDGE_PX) {
        const intrusion = pointer.y - (rect.bottom - AUTO_SCROLL_EDGE_PX);
        speed = Math.min(AUTO_SCROLL_MAX_SPEED_PX, intrusion / 4);
      }
      if (speed !== 0) {
        container.scrollTop += speed;
        scheduleRectRefresh();
        pendingPointerRef.current = pointer;
        pendingResolveRef.current = true;
        schedule();
      }
    };

    const flush = () => {
      rafRef.current = null;
      const pointer = pendingPointerRef.current;
      if (!pointer) {
        return;
      }
      store.setPointer(pointer);

      if (!pendingResolveRef.current) {
        return;
      }
      pendingResolveRef.current = false;
      const draggingId = store.getSnapshot().draggingId;
      if (!draggingId) {
        return;
      }
      store.setDropTarget(
        configRef.current.resolveDropTarget({
          sourceId: draggingId,
          pointer,
          rects: rectsRef.current,
        })
      );
    };

    const schedule = () => {
      if (rafRef.current != null) {
        return;
      }
      rafRef.current = requestAnimationFrame(flush);
    };

    const teardown = () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingPointerRef.current = null;
      pendingResolveRef.current = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };

    return {
      store,
      get channel() {
        return configRef.current.channel;
      },
      beginDrag(sourceId, pointer, event) {
        refreshRects();
        if (event.dataTransfer) {
          configRef.current.channel.write(event.dataTransfer, sourceId);
        }
        const dragImage =
          configRef.current.resolveDragImage?.(sourceId) ??
          configRef.current.dragImage;
        applyDragImage(dragImage, sourceId, event);
        store.startDrag(sourceId, pointer);
        configRef.current.onDragStart?.({
          sourceId,
          pointer,
          pointerDrag: false,
        });

        const trackPointer = (nativeEvent: globalThis.DragEvent) => {
          nativeEvent.preventDefault();
          pendingPointerRef.current = {
            x: nativeEvent.clientX,
            y: nativeEvent.clientY,
          };
          pendingResolveRef.current = true;
          schedule();
        };
        document.addEventListener("dragover", trackPointer);
        window.addEventListener("scroll", scheduleRectRefresh, true);
        window.addEventListener("resize", scheduleRectRefresh);
        cleanupRef.current = () => {
          document.removeEventListener("dragover", trackPointer);
          window.removeEventListener("scroll", scheduleRectRefresh, true);
          window.removeEventListener("resize", scheduleRectRefresh);
          if (rectRefreshFrame != null) {
            cancelAnimationFrame(rectRefreshFrame);
            rectRefreshFrame = null;
          }
        };
      },
      beginPointerDrag(sourceId, pointer) {
        refreshRects();
        store.startDrag(sourceId, pointer, true);
        store.setDropTarget(
          configRef.current.resolveDropTarget({
            sourceId,
            pointer,
            rects: rectsRef.current,
          })
        );
        configRef.current.onDragStart?.({
          sourceId,
          pointer,
          pointerDrag: true,
        });

        const sourceEl = document.querySelector(
          `[${configRef.current.rowAttribute}="${CSS.escape(sourceId)}"]`
        );
        autoScrollContainer = findScrollableAncestor(
          sourceEl instanceof HTMLElement ? sourceEl : null
        );
        if (autoScrollContainer && autoScrollFrame == null) {
          autoScrollFrame = requestAnimationFrame(runAutoScroll);
        }

        window.addEventListener("scroll", scheduleRectRefresh, true);
        window.addEventListener("resize", scheduleRectRefresh);
        cleanupRef.current = () => {
          window.removeEventListener("scroll", scheduleRectRefresh, true);
          window.removeEventListener("resize", scheduleRectRefresh);
          if (rectRefreshFrame != null) {
            cancelAnimationFrame(rectRefreshFrame);
            rectRefreshFrame = null;
          }
          stopAutoScroll();
        };
      },
      movePointer(pointer) {
        pendingPointerRef.current = pointer;
        pendingResolveRef.current = true;
        schedule();
      },
      clearDropTarget() {
        store.setDropTarget(null);
      },
      commitPointerDrop() {
        const snapshot = store.getSnapshot();
        const sourceId = snapshot.draggingId;
        const pointer = snapshot.pointer ?? { x: 0, y: 0 };
        const target =
          snapshot.dropTarget ??
          (sourceId
            ? configRef.current.resolveDropTarget({
                sourceId,
                pointer,
                rects: rectsRef.current,
              })
            : null);

        teardown();
        store.endDrag();
        configRef.current.onDragEnd?.();

        if (sourceId && target) {
          configRef.current.onDrop({ sourceId, target, pointer });
        }
      },
      commitDrop(event) {
        const dataTransfer = event.dataTransfer;
        const snapshot = store.getSnapshot();
        const sourceId =
          (dataTransfer
            ? configRef.current.channel.read(dataTransfer)
            : null) ?? snapshot.draggingId;
        const pointer: DragPointer = {
          x: event.clientX,
          y: event.clientY,
        };
        const target =
          snapshot.dropTarget ??
          (sourceId
            ? configRef.current.resolveDropTarget({
                sourceId,
                pointer,
                rects: rectsRef.current,
              })
            : null);

        teardown();
        store.endDrag();
        configRef.current.onDragEnd?.();

        if (sourceId && target) {
          configRef.current.onDrop({ sourceId, target, pointer });
        }
      },
      cancelDrag() {
        teardown();
        store.endDrag();
        configRef.current.onDragEnd?.();
      },
    };
  }, [store]);

  useEffect(
    () => () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
      cleanupRef.current?.();
    },
    []
  );

  return (
    <DndContext.Provider value={value as DndContextValue<unknown>}>
      {children}
    </DndContext.Provider>
  );
}
