/**
 * Pure planners for saved-view tab reorder (title-row TabsList). Order is the
 * `views[]` array index — no separate order field.
 */

export interface ViewTabDropZoneRect {
  left: number;
  right: number;
  viewId: string;
}

export interface ViewTabDropSpot {
  edge: "before" | "after";
  viewId: string;
}

/**
 * Resolve the tab drop boundary from pointer x. Outside every rect snaps to
 * the nearest end of the strip (same grammar as column header reorder).
 * Does not filter no-ops — see {@link resolveViewTabDropTarget}.
 */
export function resolveViewTabDropSpot(
  rects: readonly ViewTabDropZoneRect[],
  pointerX: number
): ViewTabDropSpot | null {
  if (rects.length === 0) {
    return null;
  }

  const hit = rects.find(
    (rect) => pointerX >= rect.left && pointerX < rect.right
  );
  if (hit) {
    const edge = pointerX < (hit.left + hit.right) / 2 ? "before" : "after";
    return { viewId: hit.viewId, edge };
  }

  const first = rects[0];
  const last = rects.at(-1) ?? first;
  return pointerX < first.left
    ? { viewId: first.viewId, edge: "before" }
    : { viewId: last.viewId, edge: "after" };
}

/**
 * Build the next `views` id order after dropping `sourceViewId` before/after
 * `targetViewId`. Returns `null` for a no-op (unknown ids or same slot).
 */
export function planViewReorder(args: {
  edge: "before" | "after";
  sourceViewId: string;
  targetViewId: string;
  viewIds: readonly string[];
}): string[] | null {
  const { edge, sourceViewId, targetViewId, viewIds } = args;
  const sourceIndex = viewIds.indexOf(sourceViewId);
  if (sourceIndex === -1) {
    return null;
  }
  // Own edges (before/after the source tab) never move it.
  if (sourceViewId === targetViewId) {
    return null;
  }

  const withoutSource = viewIds.filter((id) => id !== sourceViewId);
  let insertIndex = withoutSource.indexOf(targetViewId);
  if (insertIndex === -1) {
    return null;
  }
  if (edge === "after") {
    insertIndex += 1;
  }

  // Dropping onto either edge of the source's own neighbors that leaves it
  // in place (e.g. before the next item while dragging the previous).
  if (insertIndex === sourceIndex) {
    return null;
  }

  return [
    ...withoutSource.slice(0, insertIndex),
    sourceViewId,
    ...withoutSource.slice(insertIndex),
  ];
}

/**
 * Resolve a drop boundary that would actually move `sourceViewId`. Returns
 * `null` when the pointer maps to the source's own current slot (either edge
 * of itself, or the adjacent edge of a neighbor) so the indicator stays off
 * for no-op destinations — including index 0's left edge while dragging it.
 */
export function resolveViewTabDropTarget(
  rects: readonly ViewTabDropZoneRect[],
  pointerX: number,
  sourceViewId: string
): ViewTabDropSpot | null {
  const spot = resolveViewTabDropSpot(rects, pointerX);
  if (!spot) {
    return null;
  }
  const plan = planViewReorder({
    viewIds: rects.map((rect) => rect.viewId),
    sourceViewId,
    targetViewId: spot.viewId,
    edge: spot.edge,
  });
  return plan ? spot : null;
}
