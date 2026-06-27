import { type RefObject, useEffect } from "react";

/** Gap between the bar and the top of the keyboard. */
const KEYBOARD_GAP_PX = 8;

/**
 * Pins a ref'd element directly above the on-screen keyboard while `enabled`.
 *
 * iOS Safari is the hard case: it positions `position: fixed` against the
 * (full-height) layout viewport, drags fixed elements during scroll, collapses
 * its URL bar (changing `window.innerHeight`), and does not fire scroll/resize
 * events during momentum scroll. To stay glued to the keyboard:
 * - Position with a composited **`transform: translate3d`** computed straight
 *   from the visual viewport (`offsetTop + height - barHeight - gap`) — avoids
 *   the unstable `innerHeight` term, tracks the keyboard as `offsetTop` changes
 *   with scroll, and (unlike animating `top`) re-pins without per-frame layout,
 *   so scrolling stays smooth.
 * - Re-apply on visualViewport resize/scroll, capture-phase document scroll, and
 *   a continuous `requestAnimationFrame` loop while enabled, so it keeps tracking
 *   during event-less momentum scrolling.
 * - Write straight to `element.style.transform` (not React state) to avoid render lag.
 *
 * Visibility is driven by the caller (focus state), NOT by a keyboard-height
 * threshold — that threshold collapses during scroll (offsetTop rises) and would
 * make the bar flicker out mid-scroll even though the keyboard is still open.
 *
 * The element must be portaled to `document.body` (no transformed ancestor) so
 * `position: fixed` is viewport-relative.
 */
export function useKeyboardToolbarAnchor(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!vv) {
      return;
    }

    let raf = 0;
    let barHeight = 0;
    let lastY = Number.NaN;

    const position = () => {
      const el = ref.current;
      if (!el) {
        return;
      }
      const y = vv.offsetTop + vv.height - barHeight - KEYBOARD_GAP_PX;
      if (y !== lastY) {
        // Composited transform (not `top`) so re-pinning during scroll stays
        // smooth — no per-frame layout.
        el.style.transform = `translate3d(0, ${y}px, 0)`;
        lastY = y;
      }
    };
    const onEvent = () => {
      const el = ref.current;
      if (el) {
        barHeight = el.offsetHeight;
      }
      position();
    };
    const loop = () => {
      position();
      raf = requestAnimationFrame(loop);
    };

    onEvent();
    raf = requestAnimationFrame(loop);
    vv.addEventListener("resize", onEvent);
    vv.addEventListener("scroll", onEvent);
    document.addEventListener("scroll", onEvent, true);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener("resize", onEvent);
      vv.removeEventListener("scroll", onEvent);
      document.removeEventListener("scroll", onEvent, true);
    };
  }, [enabled, ref]);
}
