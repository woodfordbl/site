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
