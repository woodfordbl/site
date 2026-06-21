/** Vertical band of a row under the pointer during a drag. */
export type DragBand = "before" | "middle" | "after";

export interface BandOptions {
  /** Max px of the before/after edge bands. */
  edgePx?: number;
  /** Edge band as a fraction of row height (capped by `edgePx`). */
  edgeRatio?: number;
}

const DEFAULT_EDGE_PX = 10;
const DEFAULT_EDGE_RATIO = 0.35;

/**
 * Classifies a pointer Y within a row rect into before / middle / after bands.
 * `middle` is the surface-specific zone (nest for the sidebar tree, ignored by
 * surfaces that only insert before/after).
 */
export function resolveBand(
  clientY: number,
  rect: DOMRect,
  options: BandOptions = {}
): DragBand {
  const edgePx = options.edgePx ?? DEFAULT_EDGE_PX;
  const edgeRatio = options.edgeRatio ?? DEFAULT_EDGE_RATIO;
  const edge = Math.min(edgePx, rect.height * edgeRatio);
  const relativeY = clientY - rect.top;

  if (relativeY < edge) {
    return "before";
  }

  if (relativeY > rect.height - edge) {
    return "after";
  }

  return "middle";
}
