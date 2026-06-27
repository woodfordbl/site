import { type RefObject, useEffect } from "react";

/** Gap between the bar and the top of the keyboard. */
const KEYBOARD_GAP_PX = 8;

/**
 * True on engines where the **layout viewport resizes** for the on-screen
 * keyboard, so the bar can be pinned with plain CSS (no per-frame JS).
 *
 * We use the VirtualKeyboard API's presence as the signal: it ships only on
 * Chromium (Chrome/Edge), which is also the family that honours
 * `interactive-widget=resizes-content` — the viewport-meta value set in
 * [`__root.tsx`](../routes/__root.tsx). When that resize happens, a
 * bottom-anchored `position: fixed` element lands directly above the keyboard
 * for free. Safari and Firefox return false and take the visual-viewport JS
 * path below (Firefox technically supports `interactive-widget` but lacks the
 * detect signal — the JS path still works there, just less cheaply).
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API}
 */
function layoutViewportResizesForKeyboard(): boolean {
  return typeof navigator !== "undefined" && "virtualKeyboard" in navigator;
}

/**
 * Pins a ref'd element directly above the on-screen keyboard while `enabled`,
 * using the cheapest strategy the engine supports. Two paths:
 *
 * ## Strategy A — CSS resize (Chromium)
 *
 * `interactive-widget=resizes-content` shrinks the layout viewport when the
 * keyboard opens, so the bar just switches from a top-anchor to
 * `position: fixed; bottom: <gap>`. The compositor positions it — **zero
 * per-frame JS, zero jitter**. We only flip the inline anchor; CSS does the
 * rest. (A future, more precise option is the VirtualKeyboard API's
 * `overlaysContent` + `env(keyboard-inset-height)`, but it changes global
 * resize behaviour, so we stay on the simpler resize model here.)
 *
 * ## Strategy B — visual-viewport tracking (iOS Safari / Firefox)
 *
 * iOS Safari ignores `interactive-widget`, keeps `position: fixed` glued to the
 * full-height layout viewport (behind the keyboard), drags fixed elements
 * during scroll, and fires no scroll/resize events during momentum scroll. The
 * keyboard rides the compositor, so we chase it on the main thread without
 * dropping a frame:
 *
 * - **A single `requestAnimationFrame` loop owns positioning.** It reads the
 *   visual viewport (`offsetTop + height - barHeight - gap`) and writes a
 *   composited `transform: translate3d` only when the value changes — exactly
 *   one write per frame, no event listeners racing it. Polling every frame is
 *   what keeps it tracking through event-less iOS momentum scroll.
 * - **No layout reads in the hot path.** Bar height comes from a
 *   `ResizeObserver` (`borderBoxSize`), never `offsetHeight`, so a scrolling
 *   frame never forces a synchronous reflow.
 * - **Whole-pixel transforms.** `y` is rounded — subpixel translates
 *   re-rasterize the promoted layer each frame and shimmer against the keyboard.
 * - **iOS 26 `offsetTop` guard.** A WebKit regression
 *   ({@link https://bugs.webkit.org/show_bug.cgi?id=297779}) can leave
 *   `offsetTop` stale after a keyboard cycle; we clamp it to `>= 0`.
 *
 * The remaining iOS jitter source — the page panning the visual viewport when
 * an inner scroller rubber-bands — is killed in CSS via `overscroll-behavior`
 * on the canvas scroll container + `html`/`body`, not here. The document itself
 * never scrolls (`site-shell` is `h-svh; overflow-hidden`), so once chaining is
 * contained `offsetTop` stays put and this loop has almost nothing to chase.
 *
 * Visibility is driven by the caller (focus state), NOT by a keyboard-height
 * threshold — that threshold collapses during scroll (offsetTop rises) and would
 * make the bar flicker out mid-scroll even though the keyboard is still open.
 *
 * The element must be portaled to `document.body` (no transformed ancestor) so
 * `position: fixed` is viewport-relative, and should carry `will-change:
 * transform` + `backface-visibility: hidden` so the compositor layer is
 * allocated up front. See
 * [keyboard-toolbar](../../docs/architecture/keyboard-toolbar.md).
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
    if (!el) {
      return;
    }

    // ---- Strategy A: CSS resize (Chromium) ----
    if (layoutViewportResizesForKeyboard()) {
      el.style.top = "auto";
      el.style.bottom = `${KEYBOARD_GAP_PX}px`;
      el.style.transform = "none";
      return () => {
        el.style.top = "";
        el.style.bottom = "";
        el.style.transform = "";
      };
    }

    // ---- Strategy B: visual-viewport tracking (iOS Safari / Firefox) ----
    const vv = typeof window === "undefined" ? null : window.visualViewport;
    if (!vv) {
      return;
    }
    el.style.bottom = "auto";

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
      // Clamp guards the iOS 26 stale-offsetTop regression (WebKit #297779).
      const offsetTop = Math.max(0, vv.offsetTop);
      // Round to whole pixels: a subpixel translate re-rasterizes the layer
      // every frame and shimmers against the compositor-driven keyboard.
      const y = Math.round(offsetTop + vv.height - barHeight - KEYBOARD_GAP_PX);
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
      el.style.transform = "";
      el.style.bottom = "";
    };
  }, [enabled, ref]);
}
