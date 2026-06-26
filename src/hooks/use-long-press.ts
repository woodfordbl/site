import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useRef } from "react";

import { dismissMobileTextSelection } from "@/lib/dom/dismiss-mobile-text-selection.ts";

/** Delay before a press counts as long-press (under iOS text-selection timing). */
const LONG_PRESS_MS = 400;

/** Cancel the timer when the finger moves farther than this. */
const MOVE_TOLERANCE_PX = 10;

interface UseLongPressOptions {
  disabled?: boolean;
  onLongPress: () => void;
}

interface LongPressHandlers {
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onSelectStart: (event: Event) => void;
}

/**
 * Detects a stationary press-and-hold. Suppresses iOS text selection while the
 * timer is pending and clears focus/selection before invoking the callback.
 */
export function useLongPress({
  disabled = false,
  onLongPress,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pendingRef = useRef(false);
  const triggeredRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
    pendingRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || event.button !== 0) {
        return;
      }

      clearTimer();
      triggeredRef.current = false;
      pendingRef.current = true;
      originRef.current = { x: event.clientX, y: event.clientY };

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        pendingRef.current = false;
        triggeredRef.current = true;
        dismissMobileTextSelection();
        onLongPress();
      }, LONG_PRESS_MS);
    },
    [clearTimer, disabled, onLongPress]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const origin = originRef.current;
      if (!(origin && pendingRef.current)) {
        return;
      }

      const dx = event.clientX - origin.x;
      const dy = event.clientY - origin.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
        clearTimer();
      }
    },
    [clearTimer]
  );

  const onPointerUp = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onPointerCancel = useCallback(() => {
    clearTimer();
  }, [clearTimer]);

  const onSelectStart = useCallback((event: Event) => {
    if (pendingRef.current || triggeredRef.current) {
      event.preventDefault();
    }
  }, []);

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (pendingRef.current) {
      event.preventDefault();
    }
  }, []);

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!triggeredRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    triggeredRef.current = false;
  }, []);

  return {
    onClickCapture,
    onContextMenu,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onSelectStart,
  };
}
