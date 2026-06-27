import type {
  PointerEvent,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import {
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useCanvasRowDndContext } from "@/components/dnd/canvas-row-dnd-bridge.tsx";
import {
  DndContext,
  type DndContextValue,
} from "@/components/dnd/dnd-surface.tsx";
import { useHaptics } from "@/components/layout/haptics-provider.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { usePointerClickVsDrag } from "@/hooks/use-pointer-click-vs-drag.ts";
import { prepareDataTransferForMove } from "@/lib/dnd/drag-channel.ts";
import type { DragState, DragStore } from "@/lib/dnd/drag-store.ts";

const IDLE_STATE: DragState<unknown> = {
  draggingId: null,
  pointer: null,
  dropTarget: null,
  pointerDrag: false,
};

function useDndContext(): DndContextValue<unknown> | null {
  return useContext(DndContext);
}

/**
 * Subscribes to a slice of the surface's drag state, re-rendering only when the
 * selected value changes (per `Object.is`). Returns the slice of the idle state
 * when rendered outside a {@link DndSurface}.
 */
export function useDragState<S>(selector: (state: DragState<unknown>) => S): S {
  const ctx = useDndContext();
  const store = ctx?.store ?? null;
  const lastRef = useRef<{ snapshot: DragState<unknown>; value: S } | null>(
    null
  );

  const getSelection = useCallback(() => {
    const snapshot = store ? store.getSnapshot() : IDLE_STATE;
    const last = lastRef.current;
    if (last && last.snapshot === snapshot) {
      return last.value;
    }
    const value = selector(snapshot);
    if (last && Object.is(last.value, value)) {
      lastRef.current = { snapshot, value: last.value };
      return last.value;
    }
    lastRef.current = { snapshot, value };
    return value;
  }, [store, selector]);

  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => undefined),
    [store]
  );

  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

/** Selects from the current drop target (null when idle / outside a surface). */
export function useDropTarget<TDropTarget, S>(
  select: (target: TDropTarget | null) => S
): S {
  return useDragState((state) =>
    select((state.dropTarget as TDropTarget | null) ?? null)
  );
}

function useSurfaceDragState<S>(
  store: DragStore<unknown> | null | undefined,
  selector: (state: DragState<unknown>) => S
): S {
  const lastRef = useRef<{ snapshot: DragState<unknown>; value: S } | null>(
    null
  );

  const getSelection = useCallback(() => {
    const snapshot = store ? store.getSnapshot() : IDLE_STATE;
    const last = lastRef.current;
    if (last && last.snapshot === snapshot) {
      return last.value;
    }
    const value = selector(snapshot);
    if (last && Object.is(last.value, value)) {
      lastRef.current = { snapshot, value: last.value };
      return last.value;
    }
    lastRef.current = { snapshot, value };
    return value;
  }, [store, selector]);

  const subscribe = useCallback(
    (listener: () => void) => store?.subscribe(listener) ?? (() => undefined),
    [store]
  );

  return useSyncExternalStore(subscribe, getSelection, getSelection);
}

/**
 * Subscribes to the bridged canvas row drag store when nested inside another
 * surface (e.g. table column DnD). Use for table row drop indicators.
 */
export function useCanvasRowDropTarget<TDropTarget, S>(
  select: (target: TDropTarget | null) => S
): S {
  const ctx = useCanvasRowDndContext();
  return useSurfaceDragState(ctx?.store, (state) =>
    select((state.dropTarget as TDropTarget | null) ?? null)
  );
}

interface UseDragSourceOptions {
  /**
   * Locks the touch-drag start to one axis (vaul's `isDeltaInDirection`): the
   * drag begins only when dominant-axis travel clears the threshold *and*
   * exceeds the cross-axis delta, so an orthogonal scroll wins instead. Omit for
   * the original radial threshold (any direction).
   */
  dragAxis?: "x" | "y";
  /** Fire pick-up / drop haptics on touch drags (opt-in; off for non-grip sources). */
  haptics?: boolean;
  /** Hold duration (ms) before the grab cursor activates; omit to disable. */
  holdMs?: number;
  id: string;
  onClickWithoutDrag?: (event: PointerEvent<HTMLElement>) => void;
  onDragInteractionStart?: () => void;
  /** Use canvas row DnD when nested inside another drag surface (e.g. table columns). */
  useCanvasRowSurface?: boolean;
}

interface SourceHandlers {
  draggable: boolean;
  onClick: (event: ReactMouseEvent<HTMLElement>) => void;
  onDragEnd: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStartCapture: (event: ReactDragEvent<HTMLElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLElement>) => void;
}

/** Per-event overrides composed after the toolkit's own handlers. */
type SourceOverrides = Partial<Omit<SourceHandlers, "draggable">>;

const MOVE_THRESHOLD_PX = 2;

/** Touch drags start past this travel so a tap-to-open still registers as a tap. */
const TOUCH_DRAG_THRESHOLD_PX = 6;

/**
 * Whether a touch movement should start a drag. Without `dragAxis` the gate is
 * radial (any direction). With `dragAxis` it is direction-locked (vaul's
 * `isDeltaInDirection`): the dominant-axis travel must clear the threshold and
 * beat the cross-axis, so an orthogonal scroll wins instead of the drag.
 */
function passedTouchDragThreshold(
  movedX: number,
  movedY: number,
  dragAxis: "x" | "y" | undefined
): boolean {
  if (!dragAxis) {
    return Math.hypot(movedX, movedY) >= TOUCH_DRAG_THRESHOLD_PX;
  }
  const along = dragAxis === "x" ? movedX : movedY;
  const across = dragAxis === "x" ? movedY : movedX;
  return (
    Math.abs(along) >= TOUCH_DRAG_THRESHOLD_PX &&
    Math.abs(along) > Math.abs(across)
  );
}

function compose<E>(
  ours: (event: E) => void,
  theirs?: (event: E) => void
): (event: E) => void {
  return (event: E) => {
    ours(event);
    theirs?.(event);
  };
}

/**
 * Headless drag-source binding: returns props to spread onto the draggable
 * element plus drag/grab state. Composes click-vs-drag detection and optional
 * hold-to-grab.
 * @see docs/architecture/drag-and-drop.md
 */
export function useDragSource(options: UseDragSourceOptions): {
  getSourceProps: (overrides?: SourceOverrides) => SourceHandlers;
  isDragging: boolean;
  showGrabbing: boolean;
  shouldSuppressClick: () => boolean;
} {
  const {
    dragAxis,
    haptics,
    id,
    holdMs,
    onClickWithoutDrag,
    onDragInteractionStart,
    useCanvasRowSurface,
  } = options;
  const nestedCtx = useDndContext();
  const canvasRowCtx = useCanvasRowDndContext();
  const ctx = useCanvasRowSurface ? canvasRowCtx : nestedCtx;
  const isDragging = useDragState((state) => state.draggingId === id);
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const haptic = useHaptics();

  const [holdReady, setHoldReady] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  // Pointer (touch) drag bookkeeping — native HTML5 DnD never fires on touch.
  const touchDragOriginRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const isTouchDraggingRef = useRef(false);

  const {
    handleClick,
    handleDragStart: clickVsDragStart,
    handleDragEnd: clickVsDragEnd,
    handlePointerDown,
    handlePointerUp,
    shouldSuppressClick,
  } = usePointerClickVsDrag({ onClickWithoutDrag, onDragInteractionStart });

  const resetHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pressOriginRef.current = null;
    setHoldReady(false);
    setIsMoving(false);
  }, []);

  // --- Touch (coarse pointer) drag path ---------------------------------------
  // Native HTML5 DnD never fires on touch, so the grip is not `draggable` and
  // the drag is driven entirely by pointer events against the store directly.
  const touchPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button === 0) {
        touchDragOriginRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        isTouchDraggingRef.current = false;
      }
      handlePointerDown(event);
    },
    [handlePointerDown]
  );

  const touchPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const origin = touchDragOriginRef.current;
      if (!origin || event.pointerId !== origin.pointerId) {
        return;
      }
      if (isTouchDraggingRef.current) {
        event.preventDefault();
        ctx?.movePointer({ x: event.clientX, y: event.clientY });
        return;
      }
      const movedX = event.clientX - origin.x;
      const movedY = event.clientY - origin.y;
      if (!passedTouchDragThreshold(movedX, movedY, dragAxis)) {
        return;
      }
      isTouchDraggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(origin.pointerId);
      } catch {
        // Pointer may already be released (fast flick); drag still proceeds.
      }
      clickVsDragStart(event as unknown as ReactDragEvent<HTMLElement>);
      setIsMoving(true);
      ctx?.beginPointerDrag(id, { x: event.clientX, y: event.clientY });
      // Firmer tick as the grip lifts off into a reorder drag.
      if (haptics) {
        haptic("pickUp");
      }
    },
    [clickVsDragStart, ctx, dragAxis, haptic, haptics, id]
  );

  const touchPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const origin = touchDragOriginRef.current;
      const wasDragging = isTouchDraggingRef.current;
      if (origin && event.pointerId === origin.pointerId) {
        try {
          event.currentTarget.releasePointerCapture(origin.pointerId);
        } catch {
          // Capture may not be held; nothing to release.
        }
      }
      touchDragOriginRef.current = null;
      isTouchDraggingRef.current = false;
      if (wasDragging) {
        clickVsDragEnd();
        setIsMoving(false);
        ctx?.commitPointerDrop();
        // Settle as the grip drops into its new slot.
        if (haptics) {
          haptic("drop");
        }
      }
      // A tap opens the menu via the trailing native `click` (handleClick), not
      // here: opening on pointerup would let the menu trigger's own click toggle
      // it straight back closed. A real drag captures the pointer, so no click
      // fires and the menu stays closed.
    },
    [clickVsDragEnd, ctx, haptic, haptics]
  );

  const touchPointerCancel = useCallback(() => {
    const wasDragging = isTouchDraggingRef.current;
    touchDragOriginRef.current = null;
    isTouchDraggingRef.current = false;
    setIsMoving(false);
    if (wasDragging) {
      clickVsDragEnd();
      ctx?.cancelDrag();
    }
  }, [clickVsDragEnd, ctx]);

  // --- Native (fine pointer) drag path ----------------------------------------
  const nativePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button === 0) {
        resetHold();
        pressOriginRef.current = { x: event.clientX, y: event.clientY };
        if (holdMs != null) {
          holdTimerRef.current = setTimeout(() => {
            setHoldReady(true);
          }, holdMs);
        }
      }
      handlePointerDown(event);
    },
    [handlePointerDown, holdMs, resetHold]
  );

  const nativePointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const origin = pressOriginRef.current;
      if (!(holdReady && origin)) {
        return;
      }
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) >= MOVE_THRESHOLD_PX) {
        setIsMoving(true);
      }
    },
    [holdReady]
  );

  const nativePointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      handlePointerUp(event);
      if (event.button === 0) {
        resetHold();
      }
    },
    [handlePointerUp, resetHold]
  );

  const getSourceProps = useCallback<
    (overrides?: SourceOverrides) => SourceHandlers
  >(
    (overrides = {}) => ({
      // On touch (coarse) pointers, native HTML5 DnD never starts, so the grip
      // is not `draggable` and reorder is driven entirely by pointer events.
      draggable: !isCoarsePrimaryPointer,
      onClick: compose(handleClick, overrides.onClick),
      onDragStartCapture: compose((event) => {
        const dataTransfer = event.dataTransfer;
        if (dataTransfer && ctx) {
          prepareDataTransferForMove(dataTransfer, ctx.channel.mimeType, id);
        }
      }, overrides.onDragStartCapture),
      onDragStart: compose((event) => {
        event.stopPropagation();
        clickVsDragStart(event);
        ctx?.beginDrag(
          id,
          { x: event.clientX, y: event.clientY },
          event.nativeEvent
        );
      }, overrides.onDragStart),
      onDragEnd: compose((event) => {
        event.stopPropagation();
        clickVsDragEnd();
        resetHold();
        ctx?.cancelDrag();
      }, overrides.onDragEnd),
      onPointerDown: compose(
        isCoarsePrimaryPointer ? touchPointerDown : nativePointerDown,
        overrides.onPointerDown
      ),
      onPointerMove: compose(
        isCoarsePrimaryPointer ? touchPointerMove : nativePointerMove,
        overrides.onPointerMove
      ),
      onPointerUp: compose(
        isCoarsePrimaryPointer ? touchPointerUp : nativePointerUp,
        overrides.onPointerUp
      ),
      onPointerCancel: compose(
        isCoarsePrimaryPointer ? touchPointerCancel : resetHold,
        overrides.onPointerCancel
      ),
    }),
    [
      clickVsDragEnd,
      clickVsDragStart,
      isCoarsePrimaryPointer,
      ctx,
      handleClick,
      id,
      nativePointerDown,
      nativePointerMove,
      nativePointerUp,
      resetHold,
      touchPointerCancel,
      touchPointerDown,
      touchPointerMove,
      touchPointerUp,
    ]
  );

  return {
    getSourceProps,
    isDragging,
    showGrabbing: isDragging || (holdReady && isMoving),
    shouldSuppressClick,
  };
}

interface PointerRowDrag {
  beginPointerDrag: (pointer: { x: number; y: number }) => void;
  cancelDrag: () => void;
  commitPointerDrop: () => void;
  movePointer: (pointer: { x: number; y: number }) => void;
}

/**
 * Pointer-driven (touch) row drag bound to a single row id. Lets a content-level
 * gesture (see {@link useBlockTouchGesture}) drive the same reorder engine the
 * grip uses, without reaching into the raw {@link DndContext}.
 */
export function usePointerRowDrag(id: string): PointerRowDrag {
  const ctx = useDndContext();

  return useMemo<PointerRowDrag>(
    () => ({
      beginPointerDrag: (pointer) => ctx?.beginPointerDrag(id, pointer),
      movePointer: (pointer) => ctx?.movePointer(pointer),
      commitPointerDrop: () => ctx?.commitPointerDrop(),
      cancelDrag: () => ctx?.cancelDrag(),
    }),
    [ctx, id]
  );
}

interface DropZoneHandlers {
  onDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDrop: (event: ReactDragEvent<HTMLElement>) => void;
}

/**
 * Headless drop-zone binding: returns props to spread onto the container that
 * accepts drops for the enclosing {@link DndSurface}.
 */
export function useDropZone(): { getDropZoneProps: () => DropZoneHandlers } {
  const ctx = useDndContext();

  const getDropZoneProps = useCallback<() => DropZoneHandlers>(
    () => ({
      onDragOver: (event) => {
        if (!ctx || ctx.store.getSnapshot().draggingId == null) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        ctx.movePointer({ x: event.clientX, y: event.clientY });
      },
      onDrop: (event) => {
        if (!ctx) {
          return;
        }
        event.preventDefault();
        ctx.commitDrop(event.nativeEvent);
      },
      onDragLeave: (event) => {
        if (!ctx) {
          return;
        }
        const related = event.relatedTarget;
        if (related instanceof Node && event.currentTarget.contains(related)) {
          return;
        }
        ctx.clearDropTarget();
      },
    }),
    [ctx]
  );

  return { getDropZoneProps };
}
