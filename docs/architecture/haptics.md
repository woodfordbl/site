# Haptics

Semantic, intent-named haptic feedback for touch interactions. Call sites ask for
a *moment* (`selection`, `pickUp`, …), not a waveform; the provider maps each to a
[`web-haptics`](https://www.npmjs.com/package/web-haptics) preset, fires it on
coarse pointers only, and is a no-op everywhere else. The whole app is wrapped
once at the root, so any component can call [`useHaptics`](../../src/hooks/haptics.ts).

This is a **deliberately small** surface. Haptics are reserved for moments that
earn them (physical manipulation, committed value changes); they are *not* a
decoration to sprinkle on every tap. The rules below are the guardrail against
overuse — read [When to use / when NOT](#when-to-use--when-not) before adding a
new call site.

## Architecture

| Concern | Mechanism |
|---|---|
| Public API | [`haptics.ts`](../../src/hooks/haptics.ts) — re-exports `useHaptics`, `HapticMoment`, `HapticsProvider` |
| Provider + mapping | [`haptics-provider.tsx`](../../src/components/layout/haptics-provider.tsx) — single shared `web-haptics` instance, `MOMENT_PRESET`, coarse-pointer gate, fire-and-forget `.catch()` |
| Device gate | [`useIsCoarsePrimaryPointer`](../../src/components/layout/device-layout-provider.tsx) — `(pointer: coarse)` media query (SSR-seeded) |
| Mount | [`__root.tsx`](../../src/routes/__root.tsx) — `HapticsProvider` wraps all routes |
| Library | `web-haptics@0.0.6` ([`web-haptics/react`](https://www.npmjs.com/package/web-haptics)) |

Why centralised: gesture hooks run per block row, so one shared instance (and its
hidden iOS `<input switch>` element) avoids flooding the DOM. The trigger
deliberately does **not** gate on `isSupported` — iOS Safari reports no
`navigator.vibrate` yet still produces feedback through the library's switch
trick, which `isSupported` does not account for.

## Semantic moment map

The vocabulary is intent-first so the feel can be retuned in one place and call
sites stay readable. The `HapticMoment` union is the **allowlist** — go through
`useHaptics`, never call a `web-haptics` preset or `navigator.vibrate` directly.

| Moment | Preset | Waveform (web-haptics) | Use it for |
|---|---|---|---|
| `selection` | `selection` | 8 ms @ 0.3 — lightest tick | A committed discrete choice: checkbox / switch / radio toggle, drawer menu row, mobile toolbar command |
| `press` | `medium` | 25 ms @ 0.7 — confirming buzz | A long-press arming a block (the actions menu is now ready) |
| `pickUp` | `rigid` | 10 ms @ 1.0 — sharp tick | An armed block / grip lifting into a reorder drag |
| `drop` | `soft` | 40 ms @ 0.5 — settle | A dragged block committing to its new slot |
| `success` | `success` | 30 + 40 ms two-stage | A completed, consequential action — **reserved, no call site yet** |

`web-haptics` also ships `light`, `heavy`, `warning`, `error`, `nudge`, and
`buzz`. These are intentionally **not** mapped: add a new `HapticMoment` (and a
real call site) only when a genuine surface needs it — e.g. promote `error` /
`warning` the day a destructive-confirm or failure UX exists. Don't pre-wire
moments that nothing fires.

## Device support ("what they work with")

| Platform | How it fires | Result |
|---|---|---|
| iOS Safari (coarse) | `web-haptics` hidden `<input switch>` trick (`navigator.vibrate` is absent on iOS) | Taptic feedback |
| Android Chrome (coarse) | `navigator.vibrate` / vibration composition | Vibration |
| Desktop / fine pointer | Provider returns a no-op before reaching the library | Silent |
| No support / blocked | Fire-and-forget `.catch(() => undefined)` | Silent, never throws |

Visibility of feedback is therefore **coarse-pointer-gated, not feature-detected**.
A failed or blocked vibration can never break the gesture it accompanies.

## When to use / when NOT

The single most important rule: **a haptic confirms a meaningful, discrete,
user-initiated change — and pairs with a visible one.** If you can't point to the
state change it confirms, it doesn't get a haptic.

**Use a haptic for:**

| Situation | Moment |
|---|---|
| Physical manipulation — long-press arm, drag pick-up, drop (start/end only, never per move) | `press` / `pickUp` / `drop` |
| A committed value change on a form control — checkbox, switch, radio | `selection` |
| A discrete selection inside a touch drawer/menu | `selection` |
| Mobile editor toolbar command taps (bounded exception — a coarse-only surface above the keyboard) | `selection` |
| A completed, consequential action (when one exists) | `success` |

**Do NOT use a haptic for** (anti-patterns — these are why the surface stays small):

- Scroll, hover, focus, drag-*move*, or any per-frame / continuous motion.
- Navigation — tabs, links, route changes.
- Disclosure — collapsible / accordion, popover / drawer open-close (the animation already carries it).
- Ordinary action buttons outside the mobile-toolbar surface.
- Auto-repeat / held-button repeats.
- Desktop / fine pointers (already gated — don't try to force it).

**Mechanics every call site follows:**

- **One haptic per user action** — never stack two moments on one gesture.
- **Fire on the committing event** — `onClick` / `onCheckedChange` / gesture commit, not `pointerdown` for a tap that could still become a scroll.
- **Fire before delegating** to the handler, so the feedback lands immediately regardless of handler latency.
- **Always paired with a visible change** — haptics reinforce, never replace, a visual signal.

> **Intentional non-coverage.** Tabs and collapsibles are *not* wired for haptics
> by design (navigation / disclosure, not manipulation). The toolbar and
> checkbox/switch/radio ticks are the **ceiling** of the "light selection tick"
> pattern, not a precedent to spread to every button.

## Call-site inventory

Current confirmed sites (the audit of record):

| Location | Moment | Trigger |
|---|---|---|
| [`use-block-touch-gesture.ts`](../../src/hooks/use-block-touch-gesture.ts) | `press`, `pickUp`, `drop` | Long-press arm → drag lift → drop on a block row |
| [`use-dnd.ts`](../../src/components/dnd/use-dnd.ts) | `pickUp`, `drop` | Touch drag of a grip/handle — opt-in via `useDragSource({ haptics: true })` (e.g. [`table-structure-handle.tsx`](../../src/components/blocks/types/table/table-structure-handle.tsx)) |
| [`checkbox.tsx`](../../src/components/ui/checkbox.tsx) | `selection` | `onCheckedChange` toggle |
| [`switch.tsx`](../../src/components/ui/switch.tsx) | `selection` | `onCheckedChange` toggle |
| [`radio-group.tsx`](../../src/components/ui/radio-group.tsx) | `selection` | `onValueChange` (wired at the group level — ticks once per selection) |
| [`menu-presentation.tsx`](../../src/components/ui/menu-presentation.tsx) | `selection` | Drawer menu row tap |
| [`mobile-editor-toolbar.tsx`](../../src/components/canvas/mobile-editor-toolbar.tsx) | `selection` | Toolbar command button tap |

## Adding a call site

1. Check it against [When to use / when NOT](#when-to-use--when-not). If it's navigation, disclosure, an ordinary button, or continuous motion — stop.
2. `const haptic = useHaptics();` then fire an existing `HapticMoment` on the committing event, before delegating.
3. If no moment fits, add one to `HapticMoment` + `MOMENT_PRESET` in [`haptics-provider.tsx`](../../src/components/layout/haptics-provider.tsx) — don't bypass the union.
4. Add a row to the inventory above.

## Future work

- **Runtime overuse guard.** If call sites grow, consider coalescing identical moments fired within a short window (~50 ms) in the provider so a repeated/held action can't machine-gun the motor. Not needed at today's count.
- **Promote a feedback moment.** Wire `success` (and add `error` / `warning`) when a real consequential-completion or failure surface lands.

## Related

- [Drag-and-drop](./drag-and-drop.md) — `pickUp` / `drop` on touch drags
- [Mobile keyboard toolbar](./keyboard-toolbar.md) — `selection` on toolbar buttons
- [Motion](./motion.md) — the visual side of feedback haptics reinforce
