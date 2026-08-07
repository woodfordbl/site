import { describe, expect, it } from "vitest";

import {
  planViewReorder,
  resolveViewTabDropSpot,
  resolveViewTabDropTarget,
  type ViewTabDropZoneRect,
} from "@/lib/databases/view-reorder.ts";

describe("resolveViewTabDropSpot", () => {
  const rects: ViewTabDropZoneRect[] = [
    { viewId: "a", left: 0, right: 100 },
    { viewId: "b", left: 100, right: 200 },
    { viewId: "c", left: 200, right: 300 },
  ];

  it("returns null for an empty strip", () => {
    expect(resolveViewTabDropSpot([], 50)).toBeNull();
  });

  it("picks before/after from the hit tab's midpoint", () => {
    expect(resolveViewTabDropSpot(rects, 20)).toEqual({
      viewId: "a",
      edge: "before",
    });
    expect(resolveViewTabDropSpot(rects, 80)).toEqual({
      viewId: "a",
      edge: "after",
    });
    expect(resolveViewTabDropSpot(rects, 150)).toEqual({
      viewId: "b",
      edge: "after",
    });
  });

  it("snaps outside the strip to the nearest end", () => {
    expect(resolveViewTabDropSpot(rects, -10)).toEqual({
      viewId: "a",
      edge: "before",
    });
    expect(resolveViewTabDropSpot(rects, 400)).toEqual({
      viewId: "c",
      edge: "after",
    });
  });
});

describe("planViewReorder", () => {
  const viewIds = ["a", "b", "c", "d"] as const;

  it("moves the first tab right (after a later target)", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "a",
        targetViewId: "c",
        edge: "after",
      })
    ).toEqual(["b", "c", "a", "d"]);
  });

  it("moves the first tab before a later target", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "a",
        targetViewId: "c",
        edge: "before",
      })
    ).toEqual(["b", "a", "c", "d"]);
  });

  it("moves the last tab left (before an earlier target)", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "d",
        targetViewId: "a",
        edge: "before",
      })
    ).toEqual(["d", "a", "b", "c"]);
  });

  it("moves the last tab after an earlier target", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "d",
        targetViewId: "a",
        edge: "after",
      })
    ).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a middle tab both directions", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "b",
        targetViewId: "d",
        edge: "after",
      })
    ).toEqual(["a", "c", "d", "b"]);
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "c",
        targetViewId: "a",
        edge: "before",
      })
    ).toEqual(["c", "a", "b", "d"]);
  });

  it("returns null for drops on the source's own edges", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "a",
        targetViewId: "a",
        edge: "before",
      })
    ).toBeNull();
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "a",
        targetViewId: "a",
        edge: "after",
      })
    ).toBeNull();
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "b",
        targetViewId: "b",
        edge: "before",
      })
    ).toBeNull();
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "b",
        targetViewId: "b",
        edge: "after",
      })
    ).toBeNull();
  });

  it("returns null for neighbor edges that leave the source in place", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "b",
        targetViewId: "a",
        edge: "after",
      })
    ).toBeNull();
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "b",
        targetViewId: "c",
        edge: "before",
      })
    ).toBeNull();
  });

  it("returns null for unknown ids", () => {
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "ghost",
        targetViewId: "a",
        edge: "before",
      })
    ).toBeNull();
    expect(
      planViewReorder({
        viewIds,
        sourceViewId: "a",
        targetViewId: "ghost",
        edge: "before",
      })
    ).toBeNull();
  });
});

describe("resolveViewTabDropTarget (indicator gating)", () => {
  const rects: ViewTabDropZoneRect[] = [
    { viewId: "a", left: 0, right: 100 },
    { viewId: "b", left: 100, right: 200 },
    { viewId: "c", left: 200, right: 300 },
  ];

  it("hides the indicator on index 0's own left edge while dragging it", () => {
    expect(resolveViewTabDropTarget(rects, -10, "a")).toBeNull();
    expect(resolveViewTabDropTarget(rects, 20, "a")).toBeNull();
  });

  it("hides the indicator on the source's own right edge", () => {
    expect(resolveViewTabDropTarget(rects, 80, "a")).toBeNull();
    expect(resolveViewTabDropTarget(rects, 120, "b")).toBeNull();
    expect(resolveViewTabDropTarget(rects, 180, "b")).toBeNull();
  });

  it("hides the indicator on neighbor edges that are no-ops", () => {
    // After a / before b while dragging b — same slot.
    expect(resolveViewTabDropTarget(rects, 80, "b")).toBeNull();
    expect(resolveViewTabDropTarget(rects, 120, "a")).toBeNull();
  });

  it("shows the indicator only for meaningful destinations", () => {
    expect(resolveViewTabDropTarget(rects, 250, "a")).toEqual({
      viewId: "c",
      edge: "after",
    });
    expect(resolveViewTabDropTarget(rects, 20, "c")).toEqual({
      viewId: "a",
      edge: "before",
    });
    expect(resolveViewTabDropTarget(rects, 400, "a")).toEqual({
      viewId: "c",
      edge: "after",
    });
  });

  it("returns null for an empty strip", () => {
    expect(resolveViewTabDropTarget([], 50, "a")).toBeNull();
  });
});
