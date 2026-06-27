import { type RefObject, useEffect, useState } from "react";

/** Below this overlap the keyboard is treated as closed (ignores small UI chrome shifts). */
const KEYBOARD_OPEN_THRESHOLD_PX = 80;

/** Pixels the on-screen keyboard overlaps the layout viewport bottom, via visualViewport. */
function keyboardOverlapPx(): number {
  if (typeof window === "undefined" || !window.visualViewport) {
    return 0;
  }
  const vv = window.visualViewport;
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/**
 * Pins a ref'd element directly above the on-screen keyboard and reports whether
 * the keyboard is open.
 *
 * Positioning is written straight to `element.style.bottom` (not React state) on
 * every `visualViewport` resize/scroll and document scroll, batched with rAF.
 * iOS Safari drags `position: fixed` elements during scroll while the keyboard is
 * up and reports a changing `visualViewport.offsetTop`, so re-pinning on those
 * events — imperatively, to avoid render lag — is what keeps the bar glued to the
 * keyboard regardless of scroll. The element must be portaled to `document.body`
 * (no transformed ancestor) for `position: fixed` to be viewport-relative.
 *
 * Returns `{ isOpen: false }` when disabled, on SSR, or when the API is missing.
 */
export function useKeyboardToolbarAnchor(
  ref: RefObject<HTMLElement | null>,
  enabled = true
): { isOpen: boolean } {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      return;
    }
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!vv) {
      return;
    }

    let frame = 0;
    const apply = () => {
      frame = 0;
      const overlap = keyboardOverlapPx();
      const el = ref.current;
      if (el) {
        el.style.bottom = `${overlap}px`;
      }
      setIsOpen(overlap >= KEYBOARD_OPEN_THRESHOLD_PX);
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(apply);
      }
    };

    apply();
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
    // The editor content scrolls inside an overflow container (not window), so
    // listen in the capture phase to re-pin on those scrolls too.
    document.addEventListener("scroll", schedule, true);
    return () => {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
      document.removeEventListener("scroll", schedule, true);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [enabled, ref]);

  return { isOpen };
}
