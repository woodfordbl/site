/**
 * Shared timings for the editor's hover previews (external link OG cards and
 * page-link cards). One set of numbers so a reader sweeping a line of prose
 * past both kinds of link feels one behaviour, not two.
 */

/** Anti-flyover delay when the preview's data is already in hand. */
export const HOVER_PREVIEW_OPEN_DELAY_CACHED_MS = 120;

/** Open delay when data must be fetched first; the fetch starts on enter. */
export const HOVER_PREVIEW_OPEN_DELAY_COLD_MS = 280;

/** Grace period after leaving the link, so the pointer can reach the card. */
export const HOVER_PREVIEW_CLOSE_DELAY_MS = 150;
