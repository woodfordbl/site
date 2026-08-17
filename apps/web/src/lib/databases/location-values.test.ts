import { describe, expect, it } from "vitest";

import {
  formatCoordinateText,
  isLocationValue,
  locationCoordinate,
  normalizeLocationValue,
  parseCoordinateText,
} from "@/lib/databases/location-values.ts";

describe("parseCoordinateText", () => {
  it.each([
    ["37.7749, -122.4194", { lat: 37.7749, lng: -122.4194 }],
    ["37.7749 -122.4194", { lat: 37.7749, lng: -122.4194 }],
    ["  51.5, -0.12  ", { lat: 51.5, lng: -0.12 }],
    ["0,0", { lat: 0, lng: 0 }],
    ["-90, 180", { lat: -90, lng: 180 }],
  ])("parses %s", (input, expected) => {
    expect(parseCoordinateText(input)).toEqual(expected);
  });

  it.each([
    ["", "empty"],
    ["37.7749", "one number"],
    ["37.7749, -122.4194, 12", "three numbers"],
    ["San Francisco", "prose"],
    ["91, 0", "latitude out of range"],
    ["0, 181", "longitude out of range"],
    ["37.7749, abc", "non-numeric half"],
  ])("rejects %s (%s)", (input) => {
    expect(parseCoordinateText(input)).toBeNull();
  });
});

describe("formatCoordinateText", () => {
  it("round-trips through parseCoordinateText", () => {
    const coordinate = { lat: 37.7749, lng: -122.4194 };
    expect(parseCoordinateText(formatCoordinateText(coordinate))).toEqual(
      coordinate
    );
  });
});

describe("isLocationValue", () => {
  it.each([
    [{ label: "Kourou" }, true],
    [{ label: "", lat: 1, lng: 2 }, true],
    ["Kourou", false],
    [42, false],
    [["a"], false],
    [null, false],
    [undefined, false],
  ])("classifies %o", (value, expected) => {
    expect(isLocationValue(value as never)).toBe(expected);
  });
});

describe("normalizeLocationValue", () => {
  it("keeps a label with its resolved point", () => {
    expect(
      normalizeLocationValue({ label: "Kourou", lat: 5.239, lng: -52.7683 })
    ).toEqual({ label: "Kourou", lat: 5.239, lng: -52.7683 });
  });

  it("keeps an unresolved label with no point", () => {
    expect(normalizeLocationValue({ label: "  221B Baker Street  " })).toEqual({
      label: "221B Baker Street",
    });
  });

  it("reads a bare string as an unresolved label", () => {
    // The shape a pasted address, a CSV column, or a text→location type change
    // leaves behind: the text must survive rather than read as an empty cell.
    expect(normalizeLocationValue("Wenchang, Hainan")).toEqual({
      label: "Wenchang, Hainan",
    });
  });

  it("resolves a bare coordinate string into a point", () => {
    expect(normalizeLocationValue("19.6144, 110.951")).toEqual({
      label: "19.6144, 110.951",
      lat: 19.6144,
      lng: 110.951,
    });
  });

  it("labels a coordinate-only value with its own coordinates", () => {
    expect(
      normalizeLocationValue({ label: "", lat: 51.5, lng: -0.12 })
    ).toEqual({ label: "51.5, -0.12", lat: 51.5, lng: -0.12 });
  });

  it.each([
    ["a half pair", { label: "Somewhere", lat: 10 }],
    ["an out-of-range latitude", { label: "Somewhere", lat: 91, lng: 0 }],
    ["an out-of-range longitude", { label: "Somewhere", lat: 0, lng: 181 }],
  ])("drops %s but keeps the label", (_case, value) => {
    expect(normalizeLocationValue(value)).toEqual({ label: "Somewhere" });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a blank string", "   "],
    ["a labelless, pointless object", { label: "  " }],
    ["a number", 42],
    ["an array", ["a", "b"]],
  ])("reads %s as empty", (_case, value) => {
    expect(normalizeLocationValue(value as never)).toBeNull();
  });
});

describe("locationCoordinate", () => {
  it("returns the point of a resolved location", () => {
    expect(
      locationCoordinate({ label: "Mahia", lat: -39.262, lng: 177.8649 })
    ).toEqual({ lat: -39.262, lng: 177.8649 });
  });

  it("returns null for an unresolved label", () => {
    // The map view counts these as rows it cannot plot rather than hiding them.
    expect(locationCoordinate({ label: "221B Baker Street" })).toBeNull();
  });

  it("returns null for an empty cell", () => {
    expect(locationCoordinate(null)).toBeNull();
  });
});
