import { describe, expect, it } from "vitest";

import {
  chartConfigPatch,
  cycledColorOverrides,
} from "@/components/database/views/database-chart-config-helpers.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

const view: DatabaseView = {
  id: "v1",
  name: "Chart",
  type: "chart",
  config: {
    columnOrder: ["f-a", "f-b"],
    chart: { mark: "bar", xFieldId: "f-a", showGrid: false },
  },
};

describe("chartConfigPatch", () => {
  it("shallow-merges into config.chart and preserves other config keys", () => {
    const patch = chartConfigPatch(view, { mark: "pie", stacked: true });
    expect(patch.config.chart).toEqual({
      mark: "pie",
      xFieldId: "f-a",
      showGrid: false,
      stacked: true,
    });
    expect(patch.config.columnOrder).toEqual(["f-a", "f-b"]);
  });

  it("starts from an empty chart config when none is stored", () => {
    const bare: DatabaseView = {
      id: "v2",
      name: "",
      type: "chart",
      config: {},
    };
    expect(chartConfigPatch(bare, { xFieldId: "f-x" }).config.chart).toEqual({
      xFieldId: "f-x",
    });
  });

  it("passes undefined through so updateDatabaseView clears the key", () => {
    const patch = chartConfigPatch(view, { xFieldId: undefined });
    expect(patch.config.chart).toHaveProperty("xFieldId", undefined);
    expect(Object.keys(patch.config.chart ?? {})).toContain("xFieldId");
  });

  it("does not mutate the input view", () => {
    chartConfigPatch(view, { mark: "line" });
    expect(view.config.chart?.mark).toBe("bar");
  });
});

describe("cycledColorOverrides", () => {
  it("advances the effective token and stores it for the key", () => {
    expect(cycledColorOverrides(undefined, "opt-a", 1)).toEqual({ "opt-a": 2 });
    expect(cycledColorOverrides({ "opt-a": 2 }, "opt-a", 2)).toEqual({
      "opt-a": 3,
    });
  });

  it("wraps from token 5 back to 1", () => {
    expect(cycledColorOverrides({ "opt-a": 5 }, "opt-a", 5)).toEqual({
      "opt-a": 1,
    });
  });

  it("preserves other keys, including the empty-bucket key", () => {
    expect(cycledColorOverrides({ "": 4, "opt-b": 2 }, "opt-a", 3)).toEqual({
      "": 4,
      "opt-b": 2,
      "opt-a": 4,
    });
  });
});
