import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDragSource, usePointerRowDrag } from "@/components/dnd/use-dnd.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useHaptics } from "@/hooks/haptics.ts";

/** Hold this long before a coarse-pointer header arms for dragging (mirrors useBlockTouchGesture). */
const LONG_PRESS_MS = 450;
/** Movement past this (after arming) lifts the header into a reorder drag. */
const DRAG_THRESHOLD_PX = 8;
/** Movement before arming ⇒ the user is panning the grid; abandon the gesture. */
const SCROLL_ESCAPE_PX = 10;

type TouchPhase = "idle" | "pressing" | "armed" | "dragging";

/** Props spread onto the wrapper around a header's column-menu trigger. */
export interface DatabaseColumnHeaderDragProps {
  draggable: boolean;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
  onDragEnd?: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStart?: (event: ReactDragEvent<HTMLElement>) => void;
  onDragStartCapture?: (event: ReactDragEvent<HTMLElement>) => void;
  onMouseDownCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  style?: CSSProperties;
}

/**
 * Click-vs-drag disambiguation for a database grid header cell, wrapped
 * around the column menu trigger (which stays untouched inside).
 *
 * The wrapper swallows `pointerdown`/`mousedown` before they reach the Base
 * UI trigger, so the menu no longer opens on press — a plain click's
 * trailing `click` event still opens it (Base UI's `useClick` falls back to
 * the click path when it never saw the press). That frees the press itself
 * for the repo's drag grammar:
 *
 * - **Fine pointers** ride the shared native-DnD source (`useDragSource`):
 *   press-and-move lifts the header into an HTML5 drag on the enclosing
 *   {@link DndSurface}; a completed drag suppresses the trailing click so
 *   the menu never flashes open.
 * - **Coarse pointers** use a long-press gesture (~{@link LONG_PRESS_MS},
 *   mirroring `useBlockTouchGesture`): a plain tap clicks through to the
 *   menu, panning before the hold registers scrolls the grid natively, and
 *   holding then moving drives the same drag store via pointer events.
 */
export function useDatabaseColumnHeaderDrag(fieldId: string): {
  headerProps: DatabaseColumnHeaderDragProps;
  /** True while this header is the drag source (dim it). */
  isDragging: boolean;
  /** True once the press has committed to dragging (grabbing cursor). */
  showGrabbing: boolean;
} {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const dragSource = useDragSource({ id: fieldId, holdMs: 50 });
  const rowDrag = usePointerRowDrag(fieldId);
  const haptic = useHaptics();

  // --- Coarse (touch) long-press gesture ------------------------------------
  const phaseRef = useRef<TouchPhase>("idle");
  const originRef = useRef<{ pointerId: number; x: number; y: number } | null>(
    null
  );
  const elementRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const [isPressing, setIsPressing] = useState(false);
  const [isTouchDragging, setIsTouchDragging] = useState(false);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const element = elementRef.current;
    const origin = originRef.current;
    if (element && origin) {
      try {
        element.releasePointerCapture(origin.pointerId);
      } catch {
        // Capture may not be held; nothing to release.
      }
    }
    phaseRef.current = "idle";
    originRef.current = null;
    elementRef.current = null;
    setIsPressing(false);
    setIsTouchDragging(false);
  }, []);

  // Clean up the timer / capture if the header unmounts mid-gesture.
  useEffect(() => reset, [reset]);

  const touchPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch" || !event.isPrimary) {
        return;
      }
      reset();
      elementRef.current = event.currentTarget;
      originRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      phaseRef.current = "pressing";
      timerRef.current = setTimeout(() => {
        if (phaseRef.current !== "pressing") {
          return;
        }
        const element = elementRef.current;
        const origin = originRef.current;
        if (!(element && origin)) {
          return;
        }
        phaseRef.current = "armed";
        // Confirm the long-press registered: the header is ready to lift.
        haptic("press");
        try {
          element.setPointerCapture(origin.pointerId);
        } catch {
          // Pointer may already be released; arming still proceeds.
        }
        setIsPressing(true);
      }, LONG_PRESS_MS);
    },
    [haptic, reset]
  );

  const touchPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin || event.pointerId !== origin.pointerId) {
        return;
      }
      const distance = Math.hypot(
        event.clientX - origin.x,
        event.clientY - origin.y
      );
      const phase = phaseRef.current;

      if (phase === "pressing") {
        // Moved before the hold registered → the user is panning the grid;
        // bail and let the browser scroll natively.
        if (distance >= SCROLL_ESCAPE_PX) {
          reset();
        }
        return;
      }

      if (phase === "armed") {
        if (distance >= DRAG_THRESHOLD_PX) {
          phaseRef.current = "dragging";
          setIsTouchDragging(true);
          // Firmer tick as the header lifts off into a reorder drag.
          haptic("pickUp");
          rowDrag.beginPointerDrag({ x: event.clientX, y: event.clientY });
        }
        event.preventDefault();
        return;
      }

      if (phase === "dragging") {
        event.preventDefault();
        rowDrag.movePointer({ x: event.clientX, y: event.clientY });
      }
    },
    [haptic, reset, rowDrag]
  );

  const touchPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin || event.pointerId !== origin.pointerId) {
        return;
      }
      if (phaseRef.current === "dragging") {
        // Settle as the header drops into its new slot.
        haptic("drop");
        rowDrag.commitPointerDrop();
        suppressClickRef.current = true;
      }
      // `pressing`/`armed` fall through as a tap — the native click opens the
      // column menu.
      reset();
    },
    [haptic, reset, rowDrag]
  );

  const touchPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (origin && event.pointerId !== origin.pointerId) {
        return;
      }
      if (phaseRef.current === "dragging") {
        rowDrag.cancelDrag();
      }
      reset();
    },
    [reset, rowDrag]
  );

  // The column-menu drawer/popover is rendered inside this React subtree but
  // PORTALED to <body>, so its events re-enter React propagation through this
  // wrapper. React capture handlers here run before the drawer content's own
  // handlers — swallowing a portaled pointerdown killed vaul's drag-to-dismiss
  // (the drawer could never be swiped away). Only own presses that physically
  // land inside the header cell.
  const isPortaledEvent = (event: {
    currentTarget: HTMLElement;
    target: EventTarget;
  }) =>
    event.target instanceof Node && !event.currentTarget.contains(event.target);

  let headerProps: DatabaseColumnHeaderDragProps;
  if (isCoarsePrimaryPointer) {
    headerProps = {
      draggable: false,
      onPointerDownCapture: (event) => {
        if (isPortaledEvent(event)) {
          return;
        }
        // Keep the press away from the menu trigger (see hook JSDoc).
        event.stopPropagation();
        touchPointerDown(event);
      },
      onMouseDownCapture: (event) => {
        if (isPortaledEvent(event)) {
          return;
        }
        event.stopPropagation();
      },
      onPointerMove: touchPointerMove,
      onPointerUp: touchPointerUp,
      onPointerCancel: touchPointerCancel,
      onClickCapture: (event) => {
        if (isPortaledEvent(event)) {
          return;
        }
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onContextMenu: (event) => {
        // Suppress the native long-press context menu while the gesture owns
        // the press.
        if (phaseRef.current !== "idle") {
          event.preventDefault();
        }
      },
      style:
        isPressing || isTouchDragging ? { touchAction: "none" } : undefined,
    };
  } else {
    const sourceProps = dragSource.getSourceProps();
    headerProps = {
      draggable: sourceProps.draggable,
      onPointerDownCapture: (event) => {
        if (isPortaledEvent(event)) {
          return;
        }
        // Keep the press away from the menu trigger (see hook JSDoc). The
        // capture-phase stop also skips our own bubble handler, so invoke the
        // drag source's pointerdown directly.
        event.stopPropagation();
        sourceProps.onPointerDown(event);
      },
      onMouseDownCapture: (event) => {
        if (isPortaledEvent(event)) {
          return;
        }
        event.stopPropagation();
      },
      onPointerMove: sourceProps.onPointerMove,
      onPointerUp: sourceProps.onPointerUp,
      onPointerCancel: sourceProps.onPointerCancel,
      onDragStartCapture: sourceProps.onDragStartCapture,
      onDragStart: sourceProps.onDragStart,
      onDragEnd: sourceProps.onDragEnd,
      onClickCapture: (event) => {
        if (isPortaledEvent(event)) {
          return;
        }
        if (dragSource.shouldSuppressClick()) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
    };
  }

  return {
    headerProps,
    isDragging: dragSource.isDragging,
    showGrabbing: dragSource.showGrabbing || isTouchDragging,
  };
}
