import { describe, expect, it } from "vitest";

import {
  buildMapTooltipDetails,
  buildRegionTooltipDetails,
  regionTooltipTitle,
} from "@/lib/databases/map-tooltip.ts";
import type {
  DatabaseField,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";

const TITLE: DatabaseField = { id: "f-title", name: "Site", type: "text" };
const OPERATOR: DatabaseField = {
  id: "f-op",
  name: "Operator",
  options: [
    { id: "opt-spacex", name: "SpaceX", color: "blue" },
    { id: "opt-isro", name: "ISRO", color: "green" },
  ],
  type: "select",
};
const TAGS: DatabaseField = {
  id: "f-tags",
  name: "Tags",
  options: [
    { id: "opt-orbital", name: "Orbital", color: "purple" },
    { id: "opt-crewed", name: "Crewed" },
  ],
  type: "multiSelect",
};
const PADS: DatabaseField = {
  format: "integer",
  id: "f-pads",
  name: "Pads",
  type: "number",
};
const FIRST: DatabaseField = {
  id: "f-first",
  name: "First launch",
  type: "date",
};
const PLACE: DatabaseField = { id: "f-place", name: "Place", type: "location" };

const FIELDS = [TITLE, OPERATOR, TAGS, PADS, FIRST, PLACE];

function row(values: LocalDatabaseRow["values"]): LocalDatabaseRow {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    databaseId: "db-1",
    id: "r1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    values,
  };
}

describe("buildMapTooltipDetails", () => {
  it("returns nothing when the view names no properties", () => {
    expect(
      buildMapTooltipDetails(FIELDS, row({ "f-title": "LC-39A" }), [])
    ).toEqual([]);
    expect(
      buildMapTooltipDetails(FIELDS, row({ "f-title": "LC-39A" }), undefined)
    ).toEqual([]);
  });

  it("keeps the view's order, not the schema's", () => {
    const details = buildMapTooltipDetails(
      FIELDS,
      row({ "f-op": "opt-spacex", "f-pads": 2, "f-title": "LC-39A" }),
      ["f-pads", "f-title"]
    );

    expect(details.map((detail) => detail.label)).toEqual(["Pads", "Site"]);
  });

  it("carries option colors so pills match the grid", () => {
    const details = buildMapTooltipDetails(
      FIELDS,
      row({ "f-op": "opt-spacex" }),
      ["f-op"]
    );

    expect(details).toEqual([
      {
        fieldId: "f-op",
        label: "Operator",
        values: [{ color: "blue", text: "SpaceX" }],
      },
    ]);
  });

  it("lists every multi-select value, colorless options included", () => {
    const details = buildMapTooltipDetails(
      FIELDS,
      row({ "f-tags": ["opt-crewed", "opt-orbital"] }),
      ["f-tags"]
    );

    // Field option order, matching how the grid renders the same cell.
    expect(details[0].values).toEqual([
      { color: "purple", text: "Orbital" },
      { text: "Crewed" },
    ]);
  });

  it("formats numbers and dates the way the grid does", () => {
    const details = buildMapTooltipDetails(
      FIELDS,
      row({ "f-first": "1967-11-09", "f-pads": 1234 }),
      ["f-pads", "f-first"]
    );

    expect(details.map((detail) => detail.values[0].text)).toEqual([
      "1,234",
      "Nov 9, 1967",
    ]);
  });

  it("reads a location as its label", () => {
    const details = buildMapTooltipDetails(
      FIELDS,
      row({ "f-place": { label: "Merritt Island", lat: 28.6, lng: -80.6 } }),
      ["f-place"]
    );

    expect(details[0].values).toEqual([{ text: "Merritt Island" }]);
  });

  it("drops empty cells rather than showing a blank row", () => {
    const details = buildMapTooltipDetails(
      FIELDS,
      row({ "f-title": "LC-39A" }),
      ["f-title", "f-op", "f-pads"]
    );

    expect(details).toEqual([
      { fieldId: "f-title", label: "Site", values: [{ text: "LC-39A" }] },
    ]);
  });

  it("drops a field deleted since the view named it", () => {
    expect(
      buildMapTooltipDetails(FIELDS, row({ "f-title": "LC-39A" }), ["f-gone"])
    ).toEqual([]);
  });
});

describe("regionTooltipTitle", () => {
  it("prefers the feature's own name over the join code", () => {
    expect(
      regionTooltipTitle({ ADM0_A3: "USA", NAME: "United States" }, "USA")
    ).toBe("United States");
  });

  it("falls back through the name properties, then to the row's code", () => {
    expect(regionTooltipTitle({ NAME_LONG: "Republic of France" }, "FRA")).toBe(
      "Republic of France"
    );
    expect(regionTooltipTitle({ ADM0_A3: "KAZ" }, "KAZ")).toBe("KAZ");
    expect(regionTooltipTitle(null, "NZL")).toBe("NZL");
  });

  it("ignores a blank name", () => {
    expect(regionTooltipTitle({ NAME: "   " }, "JPN")).toBe("JPN");
  });
});

describe("buildRegionTooltipDetails", () => {
  it("shows the aggregate alone when it is the row count", () => {
    expect(
      buildRegionTooltipDetails({ rowCount: 6, value: 6 }, "Count", true)
    ).toEqual([{ fieldId: "value", label: "Count", values: [{ text: "6" }] }]);
  });

  it("adds the row count behind any other aggregate", () => {
    expect(
      buildRegionTooltipDetails(
        { rowCount: 3, value: 1_234_567 },
        "Sum of Revenue",
        false
      )
    ).toEqual([
      {
        fieldId: "value",
        label: "Sum of Revenue",
        // Grouped like every other number the grid prints.
        values: [{ text: "1,234,567" }],
      },
      { fieldId: "rows", label: "Rows", values: [{ text: "3" }] },
    ]);
  });

  it("says Row, not Rows, for one", () => {
    expect(
      buildRegionTooltipDetails({ rowCount: 1, value: 42 }, "Average", false)[1]
        .label
    ).toBe("Row");
  });
});
