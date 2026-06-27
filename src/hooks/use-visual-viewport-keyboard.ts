import { type RefObject, useEffect, useState } from "react";

/** Below this overlap the keyboard is treated as closed (ignores small UI chrome shifts). */
const KEYBOARD_OPEN_THRESHOLD_PX = 80;
/** Gap between the bar and the top of the keyboard. */
const KEYBOARD_GAP_PX = 8;

/** Pixels the on-screen keyboard overlaps the layout viewport bottom, via visualViewport. */
function keyboardOverlapPx(vv: VisualViewport): number {
  return Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
}

/**
 * Pins a ref'd element directly above the on-screen keyboard and reports whether
 * the keyboard is open.
 *
 * iOS Safari is the hard case: it positions `position: fixed` against the
 * (full-height) layout viewport, drags fixed elements during scroll while the
 * keyboard is up, collapses its URL bar (changing `window.innerHeight`), and does
 * not fire events during momentum scroll. To stay glued to the keyboard:
 * - Anchor by **`top`** computed straight from the visual viewport
 *   (`offsetTop + height - barHeight`) — this avoids the unstable `innerHeight`
 *   term and tracks the keyboard as `offsetTop` changes with scroll.
 * - Re-apply on `visualViewport` resize/scroll and capture-phase document scroll,
 *   **plus a `requestAnimationFrame` loop while the keyboard is open** so the bar
 *   keeps tracking during event-less momentum scrolling.
 * - Write straight to `element.style.top` (not React state) to avoid render lag.
 *
 * The element must be portaled to `document.body` (no transformed ancestor) so
 * `position: fixed` is viewport-relative. Returns `{ isOpen: false }` when
 * disabled, on SSR, or when the API is unavailable.
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

    let raf = 0;
    let looping = false;
    let barHeight = 0;

    const apply = (): boolean => {
      const overlap = keyboardOverlapPx(vv);
      const open = overlap >= KEYBOARD_OPEN_THRESHOLD_PX;
      const el = ref.current;
      if (el && open) {
        // Bottom of the visual viewport (top of the keyboard), in layout coords.
        const keyboardTop = vv.offsetTop + vv.height;
        el.style.top = `${keyboardTop - barHeight - KEYBOARD_GAP_PX}px`;
      }
      setIsOpen(open);
      return open;
    };

    const loop = () => {
      if (apply()) {
        raf = requestAnimationFrame(loop);
      } else {
        looping = false;
      }
    };

    const kick = () => {
      // Measure height on events (layout read) so the per-frame loop stays cheap.
      const el = ref.current;
      if (el) {
        barHeight = el.offsetHeight;
      }
      const open = apply();
      if (open && !looping) {
        looping = true;
        raf = requestAnimationFrame(loop);
      }
    };

    kick();
    vv.addEventListener("resize", kick);
    vv.addEventListener("scroll", kick);
    // The editor content scrolls inside an overflow container (not window), so
    // listen in the capture phase to re-pin on those scrolls too.
    document.addEventListener("scroll", kick, true);
    return () => {
      vv.removeEventListener("resize", kick);
      vv.removeEventListener("scroll", kick);
      document.removeEventListener("scroll", kick, true);
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [enabled, ref]);

  return { isOpen };
}
