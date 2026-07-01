# Mobile keyboard toolbar

The command bar that pins directly above the on-screen keyboard while a canvas
block field is focused (Add block, Turn into, indent, move, delete, dismiss). It is a
coarse-pointer-only surface, mounted once at the editor root and portaled to
`document.body`.

| File | Role |
| --- | --- |
| [`mobile-editor-toolbar.tsx`](../../src/components/canvas/mobile-editor-toolbar.tsx) | The bar: button groups, focus tracking, picker wiring, portal. |
| [`use-visual-viewport-keyboard.ts`](../../src/hooks/use-visual-viewport-keyboard.ts) | `useKeyboardToolbarAnchor` — owns positioning; picks a per-platform strategy. |
| [`page-canvas-editor.tsx`](../../src/components/canvas/page-canvas-editor.tsx) | Mounts the bar; the canvas scroll container carries `overscroll-contain`. |
| [`styles.css`](../../src/styles.css) | `overscroll-behavior: none` on `html`/`body`. |
| [`__root.tsx`](../../src/routes/__root.tsx) | `interactive-widget=resizes-content` in the viewport meta. |

## The core problem

The keyboard is drawn by the browser on the **compositor thread**. Keeping a web
element glued to its top means matching a compositor-driven target, and how hard
that is depends entirely on the engine:

- **Chromium** honours `interactive-widget=resizes-content`: when the keyboard
  opens, the **layout viewport shrinks**. A `position: fixed; bottom: 0` element
  then sits above the keyboard with no JavaScript — the compositor moves it.
- **iOS Safari** ignores `interactive-widget`. The layout viewport stays
  full-height, `position: fixed` is pinned **behind** the keyboard, fixed
  elements are *dragged* during scroll, and no scroll/resize events fire during
  momentum scroll. There is **no CSS-only hook** (the VirtualKeyboard API and its
  `env(keyboard-inset-*)` variables are Chromium-only — WebKit has never shipped
  them). The only lever is the `visualViewport` API, read on the main thread.

So the same code cannot be optimal on both. The hook **feature-detects and
splits**.

## Strategy A — CSS resize (Chromium)

Detected by `"virtualKeyboard" in navigator` (a Chromium-family signal that
co-occurs with `interactive-widget` support). The hook flips the bar from its
`top-0` base anchor to `position: fixed; bottom: <gap>` and clears the transform.
That's it — the layout viewport resize does the rest on the compositor. **Zero
per-frame JS, zero jitter.**

Firefox Android also supports `interactive-widget` but lacks the detect signal,
so it falls through to Strategy B. That still works (Firefox implements
`visualViewport`); it's just the more expensive path.

> **Future, more precise option:** the VirtualKeyboard API
> (`navigator.virtualKeyboard.overlaysContent = true` +
> `bottom: env(keyboard-inset-height)`) gives exact insets without depending on
> the resize model. We don't use it yet because `overlaysContent` switches the
> whole document from "resize" to "overlay", which changes how the focused field
> is scrolled into view — a larger behavioural change than this bar warrants.

## Strategy B — visual-viewport tracking (iOS Safari)

Chase the keyboard on the main thread without dropping a frame:

- **One `requestAnimationFrame` loop owns positioning.** Each frame it reads the
  visual viewport (`offsetTop + height - barHeight - gap`) as the **target** and
  writes a composited `transform: translate3d` **only when the value changes** —
  one write per frame, no scroll/resize listeners racing it. Polling every frame
  is also what tracks event-less iOS momentum scroll.
- **Spring follow ("bungie"), not 1:1 tracking.** Perfect main-thread sync with
  the compositor keyboard is impossible, so the bar doesn't try — it chases the
  target with a lightly underdamped spring (see [Follow motion](#follow-motion-spring)).
- **No layout reads in the hot path.** Bar height comes from a `ResizeObserver`
  (`borderBoxSize`), never `offsetHeight`, so a scrolling frame never forces a
  synchronous reflow.
- **Whole-pixel transforms.** `y` is rounded; subpixel translates re-rasterize
  the promoted layer every frame and shimmer against the keyboard.
- **Composited layer up front.** The bar carries `will-change: transform` +
  `backface-visibility: hidden` so it never relayouts/repaints while tracking.
- **iOS 26 `offsetTop` guard.** A WebKit regression
  ([#297779](https://bugs.webkit.org/show_bug.cgi?id=297779)) can leave
  `offsetTop` stale after a keyboard cycle; the hook clamps it to `>= 0`.

### Why scroll no longer causes jitter

The deepest iOS jitter source is the page **panning the visual viewport** as you
scroll — every pan moves `offsetTop`, and the main-thread bar lags it by a frame.

**Scroll model differs by breakpoint.** On **desktop** the document never scrolls
(`site-shell` is `md:h-svh md:overflow-hidden`,
[`site-shell.tsx`](../../src/components/layout/site-shell.tsx)) and all scrolling
happens in the inner canvas container, which carries **`overscroll-contain`**; with
no page scroll the bar is effectively static and the rAF loop has almost nothing to
chase. On **mobile** (`max-md:min-h-svh`) the **document** is the scroller — so
content can flow behind the iOS Safari bottom bar and collapse it on scroll — and
`offsetTop` now tracks real document scroll. The rAF spring chases that the same way
it already chased event-less iOS momentum scroll.

The one invariant across both: **`html`/`body` carry `overscroll-behavior: none`**
([`styles.css`](../../src/styles.css)), so a fling at a scroll boundary can't
rubber-band/pan the visual viewport. This is the highest-leverage part of the fix —
the rAF micro-optimizations above matter most for the keyboard show/hide transition
and, on mobile, for tracking the document scroll smoothly.

## Follow motion (spring)

Strategy B deliberately does **not** track the keyboard frame-perfectly — it
can't, so it leans into the imprecision instead of fighting it. The rendered
position chases the viewport target through a lightly underdamped spring
(semi-implicit Euler, integrated in the rAF loop). Two wins from one mechanism:

- **It feels natural.** Scroll-follow becomes elastic give + settle ("bungie")
  rather than a rigid stick, and the bar enters from just above its rest spot for
  a subtle **snap-down** on keyboard show.
- **It hides the lag.** A spring is a low-pass filter: the per-frame
  main-thread-vs-compositor error that used to read as jitter gets smoothed into
  the motion instead of showing as shimmer.

### Target smoothing (calms slow scrolls)

We deliberately **don't** chase the raw per-frame target on slow scrolls. Even
with the velocity lead below cancelling the spring's own lag, pinning the bar to
every micro-step of the target reads as frame-perfect tracking — rigid, and any
single-frame main-thread hitch shows. Slow scrolls should *glide*, so the spring
chases a **low-passed target**: an EMA that averages the target over a few frames.

- **Average, don't track.** Each frame the target is folded into an EMA
  (`smoothedTarget += (target − smoothedTarget) × (1 − e^(−dt/τ))`,
  τ = `FOLLOW_SMOOTHING_TAU` ≈ a few frames). The spring chases `smoothedTarget`,
  not the raw value. This trades ~a couple of frames of lag for motion that
  averages out per-frame error — exactly the smoothness we want on slow scrolls.
- **Keyboard transitions stay instant.** Big jumps (show/hide, rotation) take the
  teleport path, which resets `smoothedTarget` to the target — the averaging only
  ever applies to in-scroll motion, never the show/hide.

### Velocity lead (keeps the spring on the smoothed target)

A bare spring trails its target during steady scroll — lag ∝ velocity — which
would re-introduce mush on top of the smoothing. So the loop also tracks the
**target's own velocity** and aims the spring slightly ahead:

1. **Track + ease the velocity.** Each frame it takes the instantaneous target
   velocity `(target − prevTarget) / dt` and folds it into an exponential moving
   average (frame-rate-independent `alpha = 1 − e^(−dt/τ)`, τ = `FOLLOW_VELOCITY_TAU`).
   The EMA keeps collecting as the scroll slows, so velocity decays smoothly
   rather than snapping to zero.
2. **Lead by it.** The spring aims at `smoothedTarget + clamp(velocity × FOLLOW_LEAD_SECONDS)`.
   `FOLLOW_LEAD_SECONDS ≈ damping/stiffness`, the spring's steady-state lag — so
   the lead cancels it and the bar sits *on* the smoothed target rather than
   trailing it. The smoothing (not a tight raw-target chase) is what calms slow
   scrolls; the lead only stops the spring adding its own extra lag. Clamped to
   `FOLLOW_LEAD_MAX_PX` so a fast fling can't fling the bar ahead.
3. **Snap back on stop / reverse.** When scrolling stops or flips direction, the
   eased velocity coasts back through zero, the lead collapses to the true rest
   point, and the bar — still carrying spring momentum toward where it was
   leading — overshoots and settles. That overshoot is the requested
   overcompensation.

Behavioural rules baked into the loop:

| Situation | Behaviour |
| --- | --- |
| Steady scroll (incl. slow) | Spring chases a velocity-led **smoothed** target → glides, averaging a few frames instead of tracking each one. |
| Stop or reverse direction | Lead collapses; underdamped spring overshoots rest then settles (snap-back). |
| Large jump > `SPRING_TELEPORT_PX` (keyboard show/hide, rotation) | Teleport; reset smoothing + drop tracked velocity so neither carries into the next scroll. |
| Within `SPRING_REST_PX`, slow, target at rest | Snap to target and idle (no sub-pixel crawl). |
| `prefers-reduced-motion: reduce` | Rigid 1:1 tracking, no spring, no smoothing, no lead, no entrance. |

Tuning lives in the constants at the top of
[`use-visual-viewport-keyboard.ts`](../../src/hooks/use-visual-viewport-keyboard.ts):
`SPRING_STIFFNESS`/`SPRING_DAMPING` set the feel (ζ ≈ 0.73 → snappy with a hint
of overshoot); `FOLLOW_SMOOTHING_TAU` sets how many frames of target motion are
averaged; `FOLLOW_VELOCITY_TAU`/`FOLLOW_LEAD_SECONDS`/`FOLLOW_LEAD_MAX_PX` set the
velocity lead; `SPRING_TELEPORT_PX` the jump cutoff; `SPRING_ENTRANCE_PX` the
snap-down distance; `SPRING_MAX_DT` clamps the frame delta so a stalled tab can't
kick the spring on resume. The integrator is stable for these values at the
clamped `dt`; raise stiffness far and it would need sub-stepping.

> Strategy A (Chromium) stays on the native CSS resize — it's already smooth on
> the compositor, and taking it over with a JS spring would trade that away. The
> spring is the iOS-path follow model only.

## Visibility (both strategies)

Driven by **focus state**, never by a keyboard-height threshold. A threshold
collapses during scroll (as `offsetTop` rises the computed keyboard height
shrinks) and would flicker the bar out mid-scroll while the keyboard is still
open. The bar shows when a canvas row field is focused on a coarse primary
pointer and no block picker is open; opacity (not transform) transitions, so
tracking stays instant. See `MobileEditorToolbar` and the device axes in
[canvas-editor — Device signals](./canvas-editor.md#device-signals).

## Haptics

Every bar action (`ToolbarButton`) fires a light `selection` tick via
[`useHaptics`](../../src/hooks/haptics.ts) before delegating to its handler, so a
tap registers physically the moment it lands. The trigger is fired on `click`
(not the focus-preserving `mousedown`, which is `preventDefault`-ed) and is a
no-op off coarse pointers, matching the slash-menu and checkbox pattern. This is
a bounded exception to the minimalist haptics policy — a coarse-only surface above
the keyboard, not a precedent for ticking ordinary buttons. See
[Haptics](./haptics.md) for the semantic moment vocabulary and the when-to-use
rules.

**Boundary feedback (`disabled`).** The move-up and indent buttons take an
optional `canRun` predicate that `ToolbarButton` evaluates lazily at tap time
(rows are read live via `getRows()`, so the toolbar never re-renders on edits).
When the action is at a boundary — move up on the top block, outdent at indent 0,
indent at the max — `canRun` returns false, the button fires the `disabled`
warning buzz instead of `selection`, and skips the handler so no no-op command is
dispatched. `canMoveUp` mirrors the reducer's own `findFocusableAdjacentRowId`
check and `canIndent` mirrors its `clampBlockIndent`, so the buzz fires exactly
when the action would have done nothing. This is the one place `disabled` is
wired; the "nothing moved" is the visible counterpart the buzz stands in for.

**Move down has no boundary.** Rather than dead-ending at the last block, move
down keeps working there: `handleMove("down")` detects the missing focusable
neighbor and `insertBefore`s an empty block, shifting the focused row down a slot
(then re-focuses it with `placement: "start"`, matching a normal move, since the
insert would otherwise focus the new block). So move down always acts — it fires
the ordinary `selection` tick and never `disabled`.

## Browser support reference

| Feature | Chrome/Edge | Firefox | iOS Safari |
| --- | --- | --- | --- |
| `interactive-widget=resizes-content` | ✅ 108+ | ✅ 132+ | ❌ |
| VirtualKeyboard API / `env(keyboard-inset-*)` | ✅ 94+ | ❌ | ❌ |
| `visualViewport` (fallback we rely on) | ✅ | ✅ | ✅ |

## Future work

- Adopt the VirtualKeyboard API path for Chromium if exact insets are ever needed
  (see the note under Strategy A), guarded so the focused-field scroll-into-view
  behaviour is preserved.
- Re-evaluate the iOS 26 `offsetTop` guard once WebKit #297779 ships a fix
  (reportedly improving in 26.1); the clamp is harmless to keep.
- If iOS ever ships `interactive-widget`, both platforms collapse onto Strategy A
  and the rAF loop can be deleted.
