/**
 * @fileoverview Media queries for the three independent device axes: viewport
 * width (shell layout), primary-pointer coarseness (canvas touch UX, haptics),
 * and hover capability (the CSS reveal affordances in styles.css). Pick the
 * axis that matches the behavior — they are deliberately not interchangeable.
 */

/** Matches Tailwind `md:` breakpoint. */
export const NARROW_VIEWPORT_PX = 768;

export const MEDIA_NARROW_VIEWPORT = `(max-width: ${NARROW_VIEWPORT_PX - 1}px)`;

export const MEDIA_COARSE_PRIMARY_POINTER = "(pointer: coarse)";

export const MEDIA_HOVER_NONE = "(hover: none)";

/** UI-hint cookie for client-measured narrow viewport + coarse pointer. */
export const DEVICE_LAYOUT_COOKIE_NAME = "site-device-layout";
