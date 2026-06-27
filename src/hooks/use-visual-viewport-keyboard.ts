import { type RefObject, useEffect } from "react";

/** Gap between the bar and the top of the keyboard. */
const KEYBOARD_GAP_PX = 8;

/**
 * Pins a ref'd element directly above the on-screen keyboard while `enabled`.
 *
 * iOS Safari is the hard case: it positions `position: fixed` against the
 * (full-height) layout viewport, drags fixed elements during scroll, collapses
 * its URL bar (changing `window.innerHeight`), and does not fire scroll/resize
 * events during momentum scroll. The keyboard itself rides the compositor, so
 * the goal is to keep a main-thread-positioned bar glued to it without ever
 * dropping a frame. To do that:
 *
 * - **A single `requestAnimationFrame` loop owns positioning.** It reads the
 *   visual viewport (`offsetTop + height - barHeight - gap`) and writes a
 *   composited `transform: translate3d` every frame the value changes. One loop
 *   (no scroll/resize listeners racing it) means exactly one write per frame and
 *   no event-driven double-positioning. Polling every frame is also what keeps it
 *   tracking through event-less iOS momentum scroll.
 * - **No layout reads in the hot path.** The bar's height comes from a
 *   `ResizeObserver` (`borderBoxSize`), not `offsetHeight` — so a scrolling frame
 *   never forces a synchronous reflow. Height only changes on mount / rotation /
 *   wrap, which the observer catches.
 * - **Whole-pixel transforms.** The `y` is rounded before writing: subpixel
 *   translate values re-rasterize the promoted layer each frame and shimmer
 *   against the keyboard; snapping to integers keeps the layer stable.
 * - **Reads straight from the visual viewport**, avoiding the unstable
 *   `innerHeight` term, and writes straight to `element.style.transform` (not
 *   React state) so there is no render lag and re-pinning needs no layout.
 *
 * Visibility is driven by the caller (focus state), NOT by a keyboard-height
 * threshold — that threshold collapses during scroll (offsetTop rises) and would
 * make the bar flicker out mid-scroll even though the keyboard is still open.
 *
 * The element must be portaled to `document.body` (no transformed ancestor) so
 * `position: fixed` is viewport-relative, and should carry `will-change:
 * transform` so the compositor layer is allocated up front.
 */
export function useKeyboardToolbarAnchor(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const el = ref.current;
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!(el && vv)) {
      return;
    }

    let raf = 0;
    let barHeight = el.offsetHeight;
    let lastY = Number.NaN;

    // Track the bar's height off the main-thread layout path so the per-frame
    // loop never has to read offsetHeight (which would force a reflow mid-scroll).
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      barHeight = box
        ? box.blockSize
        : (ref.current?.offsetHeight ?? barHeight);
    });
    observer.observe(el);

    const position = () => {
      const node = ref.current;
      if (!node) {
        return;
      }
      // Round to whole pixels: a subpixel translate re-rasterizes the layer
      // every frame and shimmers against the compositor-driven keyboard.
      const y = Math.round(
        vv.offsetTop + vv.height - barHeight - KEYBOARD_GAP_PX
      );
      if (y !== lastY) {
        node.style.transform = `translate3d(0, ${y}px, 0)`;
        lastY = y;
      }
    };
    const loop = () => {
      position();
      raf = requestAnimationFrame(loop);
    };

    // Place it before the first paint of this enable, then keep tracking.
    position();
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [enabled, ref]);
}
