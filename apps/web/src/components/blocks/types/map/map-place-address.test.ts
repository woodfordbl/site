import { describe, expect, it } from "vitest";

import { mapPlaceAddress } from "@/components/blocks/types/map/use-map-block-place.ts";

/**
 * @fileoverview What a bound `map` block calls itself. The address is the
 * useful fact — which property carries it is a detail of the setup, and lives
 * in the menu that changes it — so the property name is only ever a fallback.
 */

describe("mapPlaceAddress", () => {
  it("names the place, not the property", () => {
    expect(
      mapPlaceAddress(
        {
          kind: "map",
          props: {
            center: [-52.7683, 5.239],
            markers: [
              { label: "Kourou, French Guiana", lat: 5.239, lng: -52.7683 },
            ],
            zoom: 11,
          },
        },
        "Place"
      )
    ).toBe("Kourou, French Guiana");
  });

  it("falls back to the property when the place carries no label", () => {
    expect(
      mapPlaceAddress(
        {
          kind: "map",
          props: {
            center: [-52.7683, 5.239],
            markers: [{ lat: 5.239, lng: -52.7683 }],
            zoom: 11,
          },
        },
        "Place"
      )
    ).toBe("Place");
  });

  it("shows what the row typed before anything geocoded it", () => {
    expect(
      mapPlaceAddress(
        { kind: "unresolved", label: "221B Baker Street" },
        "Place"
      )
    ).toBe("221B Baker Street");
  });

  it("says which property is still empty", () => {
    expect(mapPlaceAddress({ kind: "no-value" }, "Launch site")).toBe(
      "No Launch site yet"
    );
    expect(mapPlaceAddress({ kind: "no-value" }, undefined)).toBe(
      "No location yet"
    );
  });

  it("distinguishes a deleted property from a page that is not a row", () => {
    expect(
      mapPlaceAddress(
        { kind: "unavailable", reason: "missing-property" },
        undefined
      )
    ).toBe("Property removed");
    expect(
      mapPlaceAddress({ kind: "unavailable", reason: "not-a-row" }, undefined)
    ).toBe("Not a database row");
  });
});
