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
  dragImage?: DragImageStrategy;
  onDragEnd?: () => void;
  onDragStart?: (args: { sourceId: string; pointer: DragPointer }) => void;
  onDrop: (args: {
    sourceId: string;
    target: TDropTarget;
    pointer: DragPointer;
  }) => void;
  resolveDropTarget: (args: {
    sourceId: string;
    pointer: DragPointer;
    rects: Map<string, DOMRect>;
  }) => TDropTarget | null;
  /** Attribute used to snapshot row rects at drag start (e.g. `data-canvas-row-id`). */
  rowAttribute: string;
}

export interface DndContextValue<TDropTarget> {
  beginDrag: (sourceId: string, pointer: DragPointer, event: DragEvent) => void;
  cancelDrag: () => void;
  channel: DragChannel;
  clearDropTarget: () => void;
  commitDrop: (event: DragEvent) => void;
  movePointer: (pointer: DragPointer) => void;
  store: DragStore<TDropTarget>;
}

export const DndContext = createContext<DndContextValue<unknown> | null>(null);

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
      rectsRef.current = collectRects(configRef.current.rowAttribute);
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
        applyDragImage(configRef.current.dragImage, sourceId, event);
        store.startDrag(sourceId, pointer);
        configRef.current.onDragStart?.({ sourceId, pointer });

        const trackPointer = (nativeEvent: globalThis.DragEvent) => {
          nativeEvent.preventDefault();
          pendingPointerRef.current = {
            x: nativeEvent.clientX,
            y: nativeEvent.clientY,
          };
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
      movePointer(pointer) {
        pendingPointerRef.current = pointer;
        pendingResolveRef.current = true;
        schedule();
      },
      clearDropTarget() {
        store.setDropTarget(null);
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
