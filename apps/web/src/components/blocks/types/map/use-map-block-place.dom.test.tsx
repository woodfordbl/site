/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMapBlockPlace } from "@/components/blocks/types/map/use-map-block-place.ts";
import type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";
import type { MapProps } from "@/lib/schemas/block-props.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

/**
 * @fileoverview The binding contract for a `map` block: which place it draws,
 * and what it says when it cannot draw one. Every shortfall is its own state,
 * so a template page (empty cell) never looks like a broken binding.
 */

const model = vi.hoisted(() => ({
  current: null as InlineFormulaPageModel | null,
}));

vi.mock("@/components/editor/inline-formula-page.tsx", () => ({
  useInlineFormulaPage: () => model.current,
}));

const PLACE: DatabaseField = { id: "f-place", name: "Place", type: "location" };
const SITE: DatabaseField = { id: "f-site", name: "Site", type: "text" };

const PAGE = { createdAt: "", title: "Row", updatedAt: "" };

function onRow(values: InlineFormulaPageModel["cellValues"]): void {
  model.current = {
    cellValues: values,
    databaseFields: [SITE, PLACE],
    page: PAGE,
  };
}

const PINNED: MapProps = {
  center: [-0.12, 51.5],
  markers: [{ lat: 51.5, lng: -0.12 }],
  zoom: 11,
};

afterEach(() => {
  model.current = null;
});

describe("useMapBlockPlace", () => {
  it("passes an unbound, pinned block through untouched", () => {
    model.current = null;
    const { result } = renderHook(() => useMapBlockPlace(PINNED));

    expect(result.current).toEqual({ kind: "map", props: PINNED });
  });

  it("reads an unbound, unpinned block as a placeholder", () => {
    const { result } = renderHook(() =>
      useMapBlockPlace({ center: [0, 0], zoom: 2 })
    );

    expect(result.current.kind).toBe("empty");
  });

  it("draws the row's location, keeping the block's zoom", () => {
    onRow({ "f-place": { label: "Kourou", lat: 5.239, lng: -52.7683 } });
    const { result } = renderHook(() =>
      useMapBlockPlace({ ...PINNED, locationFieldId: "f-place" })
    );

    expect(result.current).toEqual({
      kind: "map",
      props: {
        center: [-52.7683, 5.239],
        locationFieldId: "f-place",
        // The block's own pin is replaced, never merged with the row's.
        markers: [{ label: "Kourou", lat: 5.239, lng: -52.7683 }],
        zoom: 11,
      },
    });
  });

  it("names a place the row has not geocoded yet", () => {
    onRow({ "f-place": { label: "221B Baker Street" } });
    const { result } = renderHook(() =>
      useMapBlockPlace({ ...PINNED, locationFieldId: "f-place" })
    );

    expect(result.current).toEqual({
      kind: "unresolved",
      label: "221B Baker Street",
    });
  });

  it("reports an empty cell as the ordinary state it is", () => {
    // What a row template shows before any row fills the property in.
    onRow({});
    const { result } = renderHook(() =>
      useMapBlockPlace({ ...PINNED, locationFieldId: "f-place" })
    );

    expect(result.current.kind).toBe("no-value");
  });

  it("distinguishes a deleted property from a page that is not a row", () => {
    onRow({ "f-place": { label: "Kourou", lat: 5.239, lng: -52.7683 } });
    const { result: deleted } = renderHook(() =>
      useMapBlockPlace({ ...PINNED, locationFieldId: "f-gone" })
    );
    expect(deleted.current).toEqual({
      kind: "unavailable",
      reason: "missing-property",
    });

    model.current = { cellValues: {}, databaseFields: [], page: PAGE };
    const { result: plainPage } = renderHook(() =>
      useMapBlockPlace({ ...PINNED, locationFieldId: "f-place" })
    );
    expect(plainPage.current).toEqual({
      kind: "unavailable",
      reason: "not-a-row",
    });
  });

  it("refuses a binding pointed at a property of another type", () => {
    onRow({ "f-site": "LC-39A" });
    const { result } = renderHook(() =>
      useMapBlockPlace({ ...PINNED, locationFieldId: "f-site" })
    );

    expect(result.current).toEqual({
      kind: "unavailable",
      reason: "missing-property",
    });
  });
});
