/**
 * @fileoverview Semantic haptic feedback. Call sites ask for a *moment*, never
 * a waveform; the provider maps it to a `web-haptics` preset, fires on coarse
 * pointers only, and is mounted once at the root (`__root.tsx`).
 *
 * Policy — the surface stays deliberately small. A haptic confirms a
 * meaningful, discrete, user-initiated change and always pairs with a visible
 * one; if you can't point to the state change it confirms, it doesn't get a
 * haptic. Qualifying: physical manipulation (long-press arm, drag pick-up,
 * drop — start/end only, never per move), committed form-control toggles,
 * discrete touch-drawer selections, per-notch stepper scrubs (one tick per
 * count change, not per pointer frame), mobile-toolbar command taps, and the
 * mobile sidebar's swipe/hamburger commit. Never for: scroll, hover, focus,
 * per-frame motion, navigation, tap-opened disclosure, ordinary action
 * buttons, or auto-repeat. `disabled` is the one unpaired exception: the
 * visible signal is the *absence* of the change (a boundary no-op), so the
 * buzz stands in for it — don't reuse it as a generic error tone.
 *
 * Mechanics every call site follows: one haptic per user action; fire on the
 * committing event (not `pointerdown` for a tap that could become a scroll);
 * fire before delegating so feedback lands regardless of handler latency. iOS
 * Safari only produces feedback inside an active user gesture — fire
 * synchronously from the handler (or mid-drag from `pointermove`), never from
 * a post-commit effect or the `pointerup` ending a captured drag.
 */
"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useWebHaptics } from "web-haptics/react";

import { useIsCoarsePrimaryPointer } from "@/components/layout/device-layout-provider.tsx";

/**
 * Semantic haptic moments mapped to `web-haptics` presets. Names describe the
 * interaction, not the waveform, so call sites read as intent and the feel can
 * be retuned in one place.
 *
 * - `selection` — a light tick when a discrete choice changes (drawer row tap).
 * - `press` — the confirming buzz when a long-press arms a block (menu ready).
 * - `pickUp` — a firmer tick when an armed block lifts into a reorder drag.
 * - `drop` — the settle when a dragged block commits to its new slot.
 * - `disabled` — a soft warning buzz when a tapped command can't run because it's
 *   at a boundary (e.g. "move up" on the top block — nothing moves).
 * - `success` — a two-stage pulse for a completed, consequential action.
 *
 * This union is the allowlist: call sites go through {@link useHaptics}, never
 * `web-haptics` presets or `navigator.vibrate` directly. For when each moment is
 * (and is NOT) appropriate, see
 * [haptics architecture](../../../docs/architecture/haptics.md).
 *
 * @see docs/architecture/haptics.md
 */
export type HapticMoment =
  | "selection"
  | "press"
  | "pickUp"
  | "drop"
  | "disabled"
  | "success";

/** Maps each semantic moment to a `web-haptics` preset name. */
const MOMENT_PRESET: Record<HapticMoment, string> = {
  selection: "selection",
  press: "medium",
  pickUp: "rigid",
  drop: "soft",
  disabled: "warning",
  success: "success",
};

type HapticTrigger = (moment: HapticMoment) => void;

const HapticsContext = createContext<HapticTrigger | null>(null);

/**
 * Holds a single shared `web-haptics` instance for the whole app and exposes a
 * `haptic(moment)` trigger via context. Centralised because gesture hooks run
 * per-block-row — instantiating the underlying instance (and its hidden iOS
 * `<input switch>` element) per row would flood the DOM.
 *
 * The trigger is a no-op on non-coarse pointers so desktop never buzzes, and it
 * deliberately does *not* gate on `isSupported`: iOS Safari reports no
 * `navigator.vibrate` yet still produces feedback through the library's switch
 * trick, which `isSupported` does not account for.
 *
 * @see docs/architecture/haptics.md
 */
export function HapticsProvider({ children }: { children: ReactNode }) {
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { trigger } = useWebHaptics();

  const haptic = useMemo<HapticTrigger>(() => {
    if (!isCoarsePrimaryPointer) {
      return () => undefined;
    }
    return (moment) => {
      // Fire-and-forget: a failed/blocked vibration must never break the gesture.
      trigger(MOMENT_PRESET[moment])?.catch(() => undefined);
    };
  }, [isCoarsePrimaryPointer, trigger]);

  return (
    <HapticsContext.Provider value={haptic}>{children}</HapticsContext.Provider>
  );
}

/**
 * Returns `haptic(moment)` for firing semantic haptic feedback. Safe to call
 * outside a `HapticsProvider` (returns a no-op) so it never throws in tests or
 * isolated renders.
 *
 * @see docs/architecture/haptics.md
 */
export function useHaptics(): HapticTrigger {
  const context = useContext(HapticsContext);
  return context ?? noopHaptic;
}

const noopHaptic: HapticTrigger = () => undefined;
