import { useCallback } from "react";

/**
 * Stable ref callback that focuses (and optionally selects) an input when it
 * mounts. Inline `ref={(node) => node?.select()}` callbacks are re-invoked on
 * EVERY render (their identity changes each time), which re-selects the whole
 * value after each keystroke and makes the next character replace the draft —
 * the classic "can only type one character" bug. A `useCallback([])` identity
 * is invoked only on attach/detach, so focus/select runs exactly once per
 * mount. `autoFocus` is avoided per a11y lint rules.
 */
export function useFocusOnMount<T extends HTMLInputElement>(options?: {
  select?: boolean;
}): (node: T | null) => void {
  const select = options?.select ?? false;
  return useCallback(
    (node: T | null) => {
      if (!node) {
        return;
      }
      node.focus();
      if (select) {
        node.select();
      }
    },
    [select]
  );
}
