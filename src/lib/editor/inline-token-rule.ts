/**
 * Inline tokens — formula values and page links — read as prose with one
 * hairline rule under the run. Both draw the rule as a bottom border rather
 * than a text decoration, for two independent reasons that land on the same
 * answer: a page link's rule has to run under its icon, and text decoration
 * is not drawn across atomic inline boxes (the icon slot is one); a formula
 * token truncates long values with `overflow-clip`, and a decoration below
 * its `leading-none` box falls outside the clip — Chromium can rescue it with
 * `overflow-clip-margin`, but Safari never implemented that property, so an
 * underline simply vanishes on iOS. A border paints on the element's own
 * edge, outside the clip, in every engine. The formula rule is dotted where
 * the page link's is solid, so the two stay distinguishable at a glance.
 */

/**
 * Rule distance below the text baseline for a bordered token. A
 * `leading-none` box already ends ~0.15em below the baseline (the font's
 * descent plus half-leading), so the border only needs the remainder as
 * padding to sit ~0.22em under the baseline — in `em` rather than px so the
 * gap tracks headings and the page text scale instead of crowding larger
 * type.
 */
export const inlineTokenBorderOffsetClassName = "pb-[0.07em]";
