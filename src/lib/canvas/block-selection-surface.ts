/**
 * Block selection paints `bg-selection` on `[data-canvas-row-content]`, which
 * sits *behind* the block. Surfaces that carry their own opaque background —
 * a database grid's sticky header cells, pinned cells, and Calculate row —
 * would hide that fill, so they mark themselves with
 * {@link BLOCK_SELECTION_SURFACE_ATTRIBUTE} and the row repaints them.
 *
 * Marked surfaces must keep `transition-colors` at rest: the row's fill fades
 * over the same 150ms, and an untransitioned surface would snap ahead of it
 * (the header appearing to linger after the rest of the block clears).
 */
export const BLOCK_SELECTION_SURFACE_ATTRIBUTE = "data-block-selection-surface";

/** Spread onto an opaque in-block surface to opt it into the selection fill. */
export const blockSelectionSurfaceProps = {
  [BLOCK_SELECTION_SURFACE_ATTRIBUTE]: "",
} as const;

/** Row-content classes that repaint marked surfaces while the row is selected. */
export const blockSelectionSurfaceFillClassName =
  "[&_[data-block-selection-surface]]:bg-selection";

/**
 * Background for the row-select lane of a marked full-width band (a grid's
 * sticky header row, its Calculate row). The lane lives in the grid's left
 * bleed, outside the block, and must stay out of the selection — but it
 * overlaps the row fill's `pl-1` inset by 4px, so an opaque lane would notch
 * the fill's left edge. This underlay stops at the block edge (`right-1`)
 * instead, leaving the inset tinted while still occluding scrolled rows.
 */
export const blockSelectionLaneUnderlayClassName =
  "absolute inset-y-0 right-1 left-0 bg-background";
