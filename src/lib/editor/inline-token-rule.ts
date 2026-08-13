/**
 * Inline tokens — formula values and page links — read as prose with one
 * hairline rule under the run. The rule must sit the same distance below the
 * prose baseline in both, but they cannot draw it the same way: a page link's
 * rule also has to run under its icon, and text decoration is not drawn across
 * atomic inline boxes (the icon slot is one). So a formula underlines, a page
 * link borders, and these two values keep the results level with each other.
 */

/**
 * Rule distance below the text baseline. In `em` rather than the `4px` it
 * works out to at body size, so the gap tracks headings and the page text
 * scale instead of crowding larger type.
 */
export const inlineTokenUnderlineOffsetClassName = "underline-offset-[0.22em]";

/**
 * The same distance for a bordered token. A `leading-none` box already ends
 * ~0.15em below the baseline (the font's descent plus half-leading), so the
 * border only needs the remainder as padding to land where the underline does.
 */
export const inlineTokenBorderOffsetClassName = "pb-[0.07em]";
