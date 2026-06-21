export const MIN_MEDIA_WIDTH_PERCENT = 25;
export const MAX_MEDIA_WIDTH_PERCENT = 100;
export const DEFAULT_MEDIA_WIDTH_PERCENT = 100;

export function resolveMediaWidthPercent(
  widthPercent: number | undefined
): number {
  if (widthPercent === undefined) {
    return DEFAULT_MEDIA_WIDTH_PERCENT;
  }
  return clampMediaWidthPercent(widthPercent);
}

export function clampMediaWidthPercent(widthPercent: number): number {
  return Math.round(
    Math.min(
      MAX_MEDIA_WIDTH_PERCENT,
      Math.max(MIN_MEDIA_WIDTH_PERCENT, widthPercent)
    )
  );
}

/** Width change for a left-anchored block (one edge follows the pointer). */
export function widthPercentFromDelta(options: {
  anchor: "left" | "right";
  containerWidthPx: number;
  deltaPx: number;
  startWidthPercent: number;
}): number {
  const { anchor, containerWidthPx, deltaPx, startWidthPercent } = options;
  if (containerWidthPx <= 0) {
    return startWidthPercent;
  }

  const startWidthPx = (startWidthPercent / 100) * containerWidthPx;
  const delta = anchor === "right" ? deltaPx : -deltaPx;
  const nextWidthPx = startWidthPx + delta;
  const nextPercent = (nextWidthPx / containerWidthPx) * 100;
  return clampMediaWidthPercent(nextPercent);
}

/**
 * Width change for a horizontally centered block — center stays fixed, so each
 * edge moves half the pointer delta and total width changes by 2× the delta.
 */
export function widthPercentFromCenteredDelta(options: {
  anchor: "left" | "right";
  containerWidthPx: number;
  deltaPx: number;
  startWidthPercent: number;
}): number {
  const { anchor, containerWidthPx, deltaPx, startWidthPercent } = options;
  if (containerWidthPx <= 0) {
    return startWidthPercent;
  }

  const startWidthPx = (startWidthPercent / 100) * containerWidthPx;
  const widthDelta = 2 * (anchor === "right" ? deltaPx : -deltaPx);
  const nextWidthPx = startWidthPx + widthDelta;
  const nextPercent = (nextWidthPx / containerWidthPx) * 100;
  return clampMediaWidthPercent(nextPercent);
}
