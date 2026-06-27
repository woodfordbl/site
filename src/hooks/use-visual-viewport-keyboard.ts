import { type RefObject, useEffect } from "react";

/** Gap between the bar and the top of the keyboard. */
const KEYBOARD_GAP_PX = 8;

/**
 * Spring-follow ("bungie") tuning for the iOS visual-viewport path. Instead of
 * snapping the bar to the keyboard 1:1 every frame, it chases the target with a
 * lightly underdamped spring: scroll-follow reads as natural elastic give +
 * settle rather than rigid tracking, which *also* masks the main-thread vs
 * compositor frame lag that made the bar look jittery. Large target jumps
 * (keyboard show/hide, rotation) teleport so the bar never swoops across the
 * screen. Disabled under `prefers-reduced-motion` (falls back to rigid tracking).
 */
const SPRING_STIFFNESS = 230; // higher = snappier catch-up
const SPRING_DAMPING = 22; // ζ ≈ 0.73 → small overshoot = the "snap"
const SPRING_TELEPORT_PX = 120; // target jumps larger than this skip the spring
const SPRING_REST_PX = 0.5; // within this of target (and slow) → settle + idle
const SPRING_REST_VELOCITY = 4; // px/s rest threshold
const SPRING_MAX_DT = 1 / 30; // clamp frame delta so a stall can't kick the spring
const SPRING_ENTRANCE_PX = 10; // start this far above rest → "snap down" on show

/**
 * Velocity-lead tuning. The raw spring trails the target during steady scroll
 * (lag ∝ velocity), which reads as mushy on slow scrolls. So we estimate the
 * target's velocity with an exponential moving average (the "easing", time
 * constant {@link FOLLOW_VELOCITY_TAU}) and aim the spring slightly *ahead* of
 * the target by `velocity * lead` — sized to cancel the steady-state lag, so
 * even slow scrolls track tightly. When motion stops or reverses, the EMA
 * velocity eases back through zero, the lead collapses, and the underdamped
 * spring overshoots the rest point and settles: the "snap back" overcompensation.
 */
const FOLLOW_VELOCITY_TAU = 0.05; // s — EMA window for target velocity (~3 frames)
const FOLLOW_LEAD_SECONDS = 0.08; // ≈ damping/stiffness → cancels steady-state lag
const FOLLOW_LEAD_MAX_PX = 24; // clamp how far ahead the bar may run

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
 *   visual viewport (`offsetTop + height - barHeight - gap`) as the *target* and
 *   writes a composited `transform: translate3d` only when the value changes —
 *   one write per frame, no event listeners racing it. Polling every frame is
 *   what keeps it tracking through event-less iOS momentum scroll.
 * - **Spring follow ("bungie"), not 1:1 tracking.** Perfect main-thread sync
 *   with the compositor-driven keyboard is impossible, so instead of fighting
 *   for it the bar chases the target with a lightly underdamped spring
 *   (semi-implicit Euler; `SPRING_*` constants). Scroll-follow reads as natural
 *   elastic give + settle, and the smoothing *absorbs* the per-frame lag that
 *   used to read as jitter. Large jumps (keyboard show/hide, rotation) teleport
 *   so the bar never swoops; on show it enters from just above its rest position
 *   for a subtle "snap down". Honors `prefers-reduced-motion` (rigid tracking).
 * - **No layout reads in the hot path.** Bar height comes from a
 *   `ResizeObserver` (`borderBoxSize`), never `offsetHeight`, so a scrolling
 *   frame never forces a synchronous reflow.
 * - **Whole-pixel transforms.** The rendered `y` is rounded — subpixel
 *   translates re-rasterize the promoted layer each frame and shimmer.
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
    let pos = Number.NaN; // rendered y (spring follows the lead target toward it)
    let vel = 0; // px/s — spring velocity of the rendered position
    let prevT = Number.NaN; // rAF timestamp of the previous frame
    let targetPrev = Number.NaN; // previous frame's raw target (for velocity)
    let targetVel = 0; // px/s — EMA-smoothed velocity of the target itself

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    // Track the bar's height off the main-thread layout path so the per-frame
    // loop never has to read offsetHeight (which would force a reflow mid-scroll).
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.borderBoxSize?.[0];
      barHeight = box
        ? box.blockSize
        : (ref.current?.offsetHeight ?? barHeight);
    });
    observer.observe(el);

    // Rest target: the keyboard top, minus the gap. Clamp guards the iOS 26
    // stale-offsetTop regression (WebKit #297779).
    const targetY = () =>
      Math.max(0, vv.offsetTop) + vv.height - barHeight - KEYBOARD_GAP_PX;

    const write = (y: number) => {
      const node = ref.current;
      if (!node) {
        return;
      }
      // Round to whole pixels: a subpixel translate re-rasterizes the layer
      // every frame and shimmers against the compositor-driven keyboard.
      const rounded = Math.round(y);
      if (rounded !== lastY) {
        node.style.transform = `translate3d(0, ${rounded}px, 0)`;
        lastY = rounded;
      }
    };

    const frame = (t: number) => {
      const target = targetY();
      const dt = Number.isNaN(prevT)
        ? 0
        : Math.min(SPRING_MAX_DT, (t - prevT) / 1000);
      prevT = t;

      if (reduceMotion || Math.abs(target - pos) > SPRING_TELEPORT_PX) {
        // Reduced motion, or a big jump (keyboard show/hide, rotation): no swoop,
        // and drop any tracked velocity so it can't carry into the next scroll.
        pos = target;
        vel = 0;
        targetVel = 0;
        targetPrev = target;
      } else if (dt > 0) {
        // Smooth the target's own velocity with an EMA (frame-rate-independent
        // alpha from dt). This keeps collecting as the scroll slows, so the lead
        // decays gradually instead of snapping to zero.
        if (!Number.isNaN(targetPrev)) {
          const instVelocity = (target - targetPrev) / dt;
          const alpha = 1 - Math.exp(-dt / FOLLOW_VELOCITY_TAU);
          targetVel += (instVelocity - targetVel) * alpha;
        }
        targetPrev = target;

        // Aim slightly ahead in the direction of travel (bounded) so steady
        // scroll tracks without lag; on stop/reverse the lead collapses and the
        // underdamped spring overshoots the true rest point — the "snap back".
        const lead = Math.max(
          -FOLLOW_LEAD_MAX_PX,
          Math.min(FOLLOW_LEAD_MAX_PX, targetVel * FOLLOW_LEAD_SECONDS)
        );
        const aim = target + lead;

        // Semi-implicit (symplectic) Euler — stable for these params at the
        // clamped dt.
        const accel = -SPRING_STIFFNESS * (pos - aim) - SPRING_DAMPING * vel;
        vel += accel * dt;
        pos += vel * dt;
        if (
          Math.abs(target - pos) < SPRING_REST_PX &&
          Math.abs(vel) < SPRING_REST_VELOCITY &&
          Math.abs(targetVel) < SPRING_REST_VELOCITY
        ) {
          // Settle only when the target itself is at rest, not mid-scroll.
          pos = target;
          vel = 0;
          targetVel = 0;
        }
      }

      write(pos);
      raf = requestAnimationFrame(frame);
    };

    // Enter from just above the rest position so the bar snaps *down* into place
    // (skipped under reduced motion). Write synchronously before the first paint.
    targetPrev = targetY();
    pos = reduceMotion ? targetPrev : targetPrev - SPRING_ENTRANCE_PX;
    write(pos);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      el.style.transform = "";
      el.style.bottom = "";
    };
  }, [enabled, ref]);
}
