import type { CSSProperties } from "react";

/**
 * Default crossfade duration (ms) for the `.hover-reveal` / swap utilities.
 * @see docs/architecture/motion.md
 */
export const REVEAL_DURATION_MS = 150;

/** Default reveal delay (ms) — controls appear immediately. */
export const REVEAL_DELAY_MS = 0;

/** Reveal delay (ms) for surfaces that intentionally wait (column dividers). */
export const REVEAL_DELAY_DELAYED_MS = 300;

interface RevealGroupOptions {
  /** Reveal delay in ms, applied on reveal only (default {@link REVEAL_DELAY_MS}). */
  delay?: number;
  /** Crossfade duration in ms (default {@link REVEAL_DURATION_MS}). */
  duration?: number;
}

interface RevealGroupProps {
  "data-reveal-group": "";
  style: CSSProperties;
}

/**
 * Props for a hover/focus container that reveals descendant `.hover-reveal` /
 * `.swap-reveal` controls. Spread onto the element children opt into via the
 * shared classes; override `duration` / `delay` per instance like a tooltip's
 * delay. Merge `style` if the element already carries inline styles.
 * @see docs/architecture/motion.md
 */
export function revealGroupProps({
  duration = REVEAL_DURATION_MS,
  delay = REVEAL_DELAY_MS,
}: RevealGroupOptions = {}): RevealGroupProps {
  return {
    "data-reveal-group": "",
    style: {
      "--reveal-duration": `${duration}ms`,
      "--reveal-delay": `${delay}ms`,
    } as CSSProperties,
  };
}
