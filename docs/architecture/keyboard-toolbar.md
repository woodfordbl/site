# Mobile keyboard toolbar

The command bar that pins directly above the on-screen keyboard while a canvas
block field is focused (Add block, Turn into, indent, move, dismiss). It is a
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
  visual viewport (`offsetTop + height - barHeight - gap`) and writes a
  composited `transform: translate3d` **only when the value changes** — one write
  per frame, no scroll/resize listeners racing it. Polling every frame is also
  what tracks event-less iOS momentum scroll.
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
We remove the pan rather than chase it faster:

1. The document **never scrolls** — `site-shell` is `h-svh; overflow-hidden`
   ([`site-shell.tsx`](../../src/components/layout/site-shell.tsx)); all scrolling
   happens in inner containers.
2. The canvas scroll container has **`overscroll-contain`**, and `html`/`body`
   have **`overscroll-behavior: none`**, so an inner-scroll fling at a boundary
   can't rubber-band the page.

With no page scroll and no rubber-band, `offsetTop` stays put while you scroll
content, so the bar is effectively static while the keyboard is up and the rAF
loop has almost nothing to chase. This CSS is the highest-leverage part of the
fix — the rAF micro-optimizations above only matter for the keyboard show/hide
transition and any residual viewport motion.

## Visibility (both strategies)

Driven by **focus state**, never by a keyboard-height threshold. A threshold
collapses during scroll (as `offsetTop` rises the computed keyboard height
shrinks) and would flicker the bar out mid-scroll while the keyboard is still
open. The bar shows when a canvas row field is focused on a coarse primary
pointer and no block picker is open; opacity (not transform) transitions, so
tracking stays instant. See `MobileEditorToolbar` and the device axes in
[canvas-editor — Device signals](./canvas-editor.md#device-signals).

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
