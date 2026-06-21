import type { DragEvent, MouseEvent, PointerEvent } from "react";
import { useRef } from "react";

/** Max pointer movement to treat release as a click (not a drag). */
export const POINTER_CLICK_DRAG_THRESHOLD_PX = 4;

interface UsePointerClickVsDragOptions {
  onClickWithoutDrag?: (event: PointerEvent<HTMLElement>) => void;
  onDragInteractionStart?: () => void;
}

/**
 * Distinguishes quick clicks from HTML5 drags (gutter grip, sidebar page rows).
 * Sets `suppressClickRef` so navigation or duplicate click handlers can bail out after a drag.
 */
export function usePointerClickVsDrag(
  options: UsePointerClickVsDragOptions = {}
) {
  const didDragRef = useRef(false);
  const suppressClickRef = useRef(false);
  const handledByPointerUpRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    pointerDownRef.current = { x: event.clientX, y: event.clientY };
    didDragRef.current = false;
    suppressClickRef.current = false;
    handledByPointerUpRef.current = false;
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (didDragRef.current) {
      pointerDownRef.current = null;
      return;
    }

    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!start) {
      return;
    }

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > POINTER_CLICK_DRAG_THRESHOLD_PX) {
      return;
    }

    if (!options.onClickWithoutDrag) {
      return;
    }

    handledByPointerUpRef.current = true;
    options.onClickWithoutDrag(event);
  };

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (shouldSuppressClick()) {
      return;
    }

    if (handledByPointerUpRef.current) {
      handledByPointerUpRef.current = false;
      return;
    }

    options.onClickWithoutDrag?.(event as unknown as PointerEvent<HTMLElement>);
  };

  const handleDragStart = (event: DragEvent<HTMLElement>) => {
    didDragRef.current = true;
    suppressClickRef.current = true;
    pointerDownRef.current = null;
    options.onDragInteractionStart?.();
    return event;
  };

  const handleDragEnd = () => {
    suppressClickRef.current = true;
  };

  const shouldSuppressClick = (): boolean => {
    if (suppressClickRef.current || didDragRef.current) {
      suppressClickRef.current = false;
      didDragRef.current = false;
      return true;
    }

    return false;
  };

  return {
    handleClick,
    handleDragEnd,
    handleDragStart,
    handlePointerDown,
    handlePointerUp,
    shouldSuppressClick,
  };
}
