import { useEffect, useRef } from "react";

const EMPTY_TIMEOUT_ID = 0;

class Timeout {
  currentId = EMPTY_TIMEOUT_ID;

  /** Executes `fn` after `delay`, clearing any previously scheduled call. */
  start(delay: number, fn: () => void) {
    this.clear();
    this.currentId = window.setTimeout(() => {
      this.currentId = EMPTY_TIMEOUT_ID;
      fn();
    }, delay);
  }

  clear() {
    if (this.currentId !== EMPTY_TIMEOUT_ID) {
      clearTimeout(this.currentId);
      this.currentId = EMPTY_TIMEOUT_ID;
    }
  }
}

/**
 * Delayed callback with automatic clear on unmount — same pattern as
 * `@base-ui/utils/useTimeout` (Tooltip hover open/close timers).
 */
export function useTimeout() {
  const timeoutRef = useRef<Timeout | null>(null);
  if (timeoutRef.current === null) {
    timeoutRef.current = new Timeout();
  }

  useEffect(() => {
    const timeout = timeoutRef.current;
    return () => {
      timeout?.clear();
    };
  }, []);

  return timeoutRef.current;
}
