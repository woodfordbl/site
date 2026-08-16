/**
 * Dev-only canvas fixture: a reserved local page seeded with every container
 * permutation (callout, columns, tabs, toggles, lists) so pointer features —
 * marquee drill, overclick routing, DnD — can be exercised without
 * hand-building content. Like the template snapshot, it lives outside the
 * navigable pages system and is reachable only via the `/dev/canvas` route.
 */

/** Reserved id for the fixture's local page record and block shard. */
export const CANVAS_FIXTURE_PAGE_ID = "dev-canvas-fixture";

/** Internal slug; never resolved as a navigable route. */
export const CANVAS_FIXTURE_PAGE_SLUG = "/__canvas_fixture__";

export const CANVAS_FIXTURE_PAGE_TITLE = "Canvas fixture";

/** True when `id` is the reserved dev fixture id. */
export function isCanvasFixturePageId(id: string | null | undefined): boolean {
  return id === CANVAS_FIXTURE_PAGE_ID;
}
