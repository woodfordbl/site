import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { usePointerRowDrag } from "@/components/dnd/use-dnd.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useHaptics } from "@/hooks/haptics.ts";

/** Hold this long (no significant move) before the block "arms" for drawer/drag. */
const LONG_PRESS_MS = 450;
/** Movement past this (after arming) begins a reorder drag. */
const DRAG_THRESHOLD_PX = 8;
/** Movement before arming ⇒ the user is scrolling/selecting; abandon the gesture. */
const SCROLL_ESCAPE_PX = 10;

type Phase = "idle" | "pressing" | "armed" | "dragging" | "released";

interface UseBlockTouchGestureOptions {
  onOpenDrawer: (rowId: string) => void;
  rowId: string;
}

interface BlockTouchGestureProps {
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  style?: CSSProperties;
}

interface BlockTouchGesture {
  /** True once the gesture is actively reordering (for drag styling). */
  isDragging: boolean;
  /** True once the hold registers (for a press/lift affordance). */
  isPressing: boolean;
  /** Spread onto the row's `[data-canvas-row-content]` element (coarse only). */
  props: BlockTouchGestureProps;
}

const EMPTY_PROPS: BlockTouchGestureProps = {
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onPointerCancel: () => undefined,
};

/**
 * Touch gesture for a gutterless mobile block: a quick tap edits text, an
 * immediate drag scrolls the page, a long press (~{@link LONG_PRESS_MS}) arms the
 * block, and from there releasing opens the actions drawer while dragging reorders
 * the block. Active only on coarse pointers; returns inert props otherwise so
 * desktop behaviour is unchanged.
 */
export function useBlockTouchGesture({
  rowId,
  onOpenDrawer,
}: UseBlockTouchGestureOptions): BlockTouchGesture {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const rowDrag = usePointerRowDrag(rowId);
  const haptic = useHaptics();

  const phaseRef = useRef<Phase>("idle");
  const originRef = useRef<{ x: number; y: number; pointerId: number } | null>(
    null
  );
  const elementRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPressing, setIsPressing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const preventSelection = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  const suppressNativeSelection = useCallback(
    (element: HTMLElement) => {
      element.style.setProperty("user-select", "none");
      element.style.setProperty("-webkit-user-select", "none");
      element.style.setProperty("-webkit-touch-callout", "none");
      element.addEventListener("selectstart", preventSelection);
      element.addEventListener("contextmenu", preventSelection);
      window.getSelection?.()?.removeAllRanges();
    },
    [preventSelection]
  );

  const restoreNativeSelection = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }
      element.style.removeProperty("user-select");
      element.style.removeProperty("-webkit-user-select");
      element.style.removeProperty("-webkit-touch-callout");
      element.removeEventListener("selectstart", preventSelection);
      element.removeEventListener("contextmenu", preventSelection);
    },
    [preventSelection]
  );

  const reset = useCallback(() => {
    clearTimer();
    const element = elementRef.current;
    const origin = originRef.current;
    if (element && origin) {
      try {
        element.releasePointerCapture(origin.pointerId);
      } catch {
        // Capture may not be held; nothing to release.
      }
    }
    restoreNativeSelection(element);
    phaseRef.current = "idle";
    originRef.current = null;
    elementRef.current = null;
    setIsPressing(false);
    setIsDragging(false);
  }, [clearTimer, restoreNativeSelection]);

  // Clean up timers / inline styles if the component unmounts mid-gesture.
  useEffect(() => reset, [reset]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== "touch" || !event.isPrimary) {
        return;
      }
      // Let the innermost row own the gesture; ignore events bubbling up from a
      // nested row's content so a list item / column child arms, not its parent.
      const target = event.target as Element | null;
      if (
        target?.closest("[data-canvas-row-content]") !== event.currentTarget
      ) {
        return;
      }

      reset();
      elementRef.current = event.currentTarget;
      originRef.current = {
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
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
        // Confirm the long-press registered: the actions menu is now ready.
        haptic("press");
        try {
          element.setPointerCapture(origin.pointerId);
        } catch {
          // Pointer may already be released; arming still proceeds.
        }
        suppressNativeSelection(element);
        setIsPressing(true);
      }, LONG_PRESS_MS);
    },
    [haptic, reset, suppressNativeSelection]
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin || event.pointerId !== origin.pointerId) {
        return;
      }
      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      const distance = Math.hypot(dx, dy);
      const phase = phaseRef.current;

      if (phase === "pressing") {
        // Moved before the hold registered → treat as scroll/selection: bail and
        // let the browser handle it natively (we never preventDefault here).
        if (distance >= SCROLL_ESCAPE_PX) {
          reset();
        }
        return;
      }

      if (phase === "armed") {
        if (distance >= DRAG_THRESHOLD_PX) {
          phaseRef.current = "dragging";
          setIsDragging(true);
          // Firmer tick as the block lifts off into a reorder drag.
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

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!origin || event.pointerId !== origin.pointerId) {
        return;
      }
      const phase = phaseRef.current;
      if (phase === "dragging") {
        // Settle as the block drops into its new slot.
        haptic("drop");
        rowDrag.commitPointerDrop();
      } else if (phase === "armed") {
        // Held still then lifted → open the actions drawer.
        onOpenDrawer(rowId);
      }
      // `pressing` (no arm yet) falls through as a plain tap — native caret/click.
      reset();
    },
    [haptic, onOpenDrawer, reset, rowDrag, rowId]
  );

  const handlePointerCancel = useCallback(
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

  if (!isCoarsePrimaryPointer) {
    return { props: EMPTY_PROPS, isPressing: false, isDragging: false };
  }

  return {
    isPressing,
    isDragging,
    props: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      style: isPressing || isDragging ? { touchAction: "none" } : undefined,
    },
  };
}
