# Motion — hover-reveal & swap

One opacity primitive backs every "secondary control that appears on hover/focus"
in the app: sidebar row actions, the page-row icon↔chevron swap, the media
toolbar and resize handles, table structure handles, table add-row/column
controls, and column-divider grips. Before this, each site re-implemented the
same idea ~10 different ways (durations of 0/100/150ms, a 300ms delay, three
easings, `@media (hover:hover)` gating and reduced-motion handling on only one
site). The primitive is pure CSS — it lives entirely in
[`src/styles.css`](../../src/styles.css) under `@layer utilities`; sites opt in
with class names and a `data-reveal-group` attribute, no helper module.

## Classes

- `.hover-reveal` — control hidden at rest, fades in when revealed.
- `.swap-reveal` / `.swap-conceal` — two elements crossfading in the **same
  slot** (the page-row icon `.swap-conceal` ↔ expand chevron `.swap-reveal`).

## Trigger

A control reveals when **either**:

1. it has a `[data-reveal-group]` ancestor that is hovered or `:focus-within`
   (the common "hover the row/frame" case), **or**
2. a site-specific utility sets `opacity: 1` (e.g. the table add-row button
   reveals on last-row hover via `group-has-[[data-table-last-row]:hover]`, or a
   handle's own `hover:opacity-100`).

The base/reveal rules are written at **zero specificity** (`:where(...)`), below
any real utility class. That means a site's force-visible state (`opacity-100`
while a menu is open / a drag is active) and any custom trigger win
automatically, with no `!important`; ties are resolved by source order inside the
block. So a site can mix the shared base with its own trigger and force states.

## Timing — standard but overridable

Duration and delay come from two CSS custom properties, with CSS fallbacks for the
defaults — so the common case needs nothing:

| Property | Default |
| --- | --- |
| `--reveal-duration` | `150ms` |
| `--reveal-delay` | `0ms` (reveal only) |

For the default feel just add `data-reveal-group=""` and let the fallbacks apply.
To tweak one instance — like a Base UI tooltip's delay — set the property inline
on the element:

```tsx
style={{ "--reveal-duration": "0ms" } as CSSProperties}
```

The delay is applied on **reveal only** (it lives in the `:hover`/`:focus-within`
rule), so controls always hide instantly.

Overrides in use:

- **Table structure handles** — instant: `style={{ "--reveal-duration": "0ms" }}`.
- **Column dividers** — deliberate wait: `style={{ "--reveal-delay": "300ms" }}` on
  the `data-reveal-group` wrapper.

## Touch / no-hover

On `@media (hover: none)` pointers (`MEDIA_HOVER_NONE` in
[`device-layout.constants.ts`](../../src/lib/device/device-layout.constants.ts)),
simple `.hover-reveal` controls stay at full opacity so they remain reachable
(there is no hover to reveal them). Swaps are left at rest (concealed element
shown, revealed element hidden) so the two slot-stacked elements never both
show. This axis is **hover capability**, not viewport width and not
`(pointer: coarse)` — canvas touch UX uses
[`useIsCoarsePrimaryPointer`](../../src/hooks/device-layout.ts) separately; see
[canvas-editor — Device signals](./canvas-editor.md#device-signals).

### Canvas block gutter

On coarse primary pointers the gutter is not mounted (`showEditGutter` in
[`block-tree-node.tsx`](../../src/components/canvas/block-tree-node.tsx)); block
actions open from long-press on row content via
[`BlockActionsDrawer`](../../src/components/canvas/block-actions-drawer.tsx).
Fine pointers keep the JS pointer-driven reveal in
[`canvas-row-shell.tsx`](../../src/components/canvas/canvas-row-shell.tsx) (300ms
delay, not this CSS primitive).

## Reduced motion

`@media (prefers-reduced-motion: reduce)` collapses every reveal/swap transition
to a short `opacity 100ms ease`, matching `.overlay-popover-surface`.

## Adding a new reveal surface

1. Put `data-reveal-group=""` on the hover/focus container (add an inline
   `--reveal-duration` / `--reveal-delay` style to override timing).
2. Add `hover-reveal` to the control that should appear (or `swap-reveal` /
   `swap-conceal` for a two-element slot swap).
3. Only reach for a site-specific trigger when the reveal condition isn't "hover
   the container" (a specific sibling, a `:has()` selector, etc.) — keep that
   utility and still use the shared classes for the hidden/animated base.
