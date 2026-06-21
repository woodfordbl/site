import { useEffect } from "react";

interface UseAutoFocusOptions {
  enabled: boolean | undefined;
  onFocus: () => void;
  onHandled?: () => void;
}

/** Imperative focus after mount when `enabled` (canvas row insert / convert). */
export function useAutoFocus({
  enabled,
  onFocus,
  onHandled,
}: UseAutoFocusOptions): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    onFocus();
    onHandled?.();
  }, [enabled, onFocus, onHandled]);
}
