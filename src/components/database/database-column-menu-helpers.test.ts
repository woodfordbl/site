import { describe, expect, it } from "vitest";

import {
  aggregateFnsForFieldType,
  calculationsWithSelection,
  columnOrderWithInsert,
  fieldTypeChangePatch,
  freezePrefixEndingAt,
  isActiveSort,
  isFrozenExactlyAt,
  renamedSelectOptions,
  toggledSorts,
  toggledWrapFieldIds,
  visibleFieldIdsAfterHide,
  withAddedSelectOption,
  withoutSelectOption,
} from "@/components/database/database-column-menu-helpers.ts";
import type { DatabaseSelectOption } from "@/lib/schemas/database.ts";

describe("aggregateFnsForFieldType", () => {
  it("offers only the universal taxonomy for text-like types", () => {
    for (const type of [
      "text",
      "checkbox",
      "select",
      "multiSelect",
      "url",
    ] as const) {
      expect(aggregateFnsForFieldType(type)).toEqual([
        "countAll",
        "countValues",
        "countUnique",
        "countEmpty",
        "countNotEmpty",
        "percentEmpty",
        "percentNotEmpty",
      ]);
    }
  });

  it("adds numeric reducers for number fields", () => {
    const fns = aggregateFnsForFieldType("number");
    expect(fns).toContain("sum");
    expect(fns).toContain("median");
    expect(fns).toContain("range");
    expect(fns).not.toContain("earliest");
  });

  it("adds earliest/latest for date fields", () => {
    const fns = aggregateFnsForFieldType("date");
    expect(fns).toContain("earliest");
    expect(fns).toContain("latest");
    expect(fns).not.toContain("sum");
  });
});

describe("sort toggling", () => {
  it("replaces the view's sorts with a single key", () => {
    expect(
      toggledSorts([{ fieldId: "a", direction: "asc" }], "b", "desc")
    ).toEqual([{ fieldId: "b", direction: "desc" }]);
  });

  it("clears sorts when the field is already sorted in that direction", () => {
    expect(
      toggledSorts([{ fieldId: "a", direction: "asc" }], "a", "asc")
    ).toEqual([]);
  });

  it("flips direction on the same field instead of clearing", () => {
    expect(
      toggledSorts([{ fieldId: "a", direction: "asc" }], "a", "desc")
    ).toEqual([{ fieldId: "a", direction: "desc" }]);
  });

  it("only reports single-key sorts as active", () => {
    const multi = [
      { fieldId: "a", direction: "asc" },
      { fieldId: "b", direction: "desc" },
    ] as const;
    expect(isActiveSort(multi, "a", "asc")).toBe(false);
    expect(isActiveSort(undefined, "a", "asc")).toBe(false);
    expect(isActiveSort([{ fieldId: "a", direction: "asc" }], "a", "asc")).toBe(
      true
    );
  });
});

describe("freeze prefix", () => {
  const order = ["a", "b", "c", "d"];

  it("returns the display-order prefix ending at the field", () => {
    expect(freezePrefixEndingAt(order, "c")).toEqual(["a", "b", "c"]);
    expect(freezePrefixEndingAt(order, "a")).toEqual(["a"]);
  });

  it("returns empty for an unknown field", () => {
    expect(freezePrefixEndingAt(order, "zz")).toEqual([]);
  });

  it("detects an exact frozen prefix", () => {
    expect(isFrozenExactlyAt(["a", "b"], ["a", "b"])).toBe(true);
    expect(isFrozenExactlyAt(["a"], ["a", "b"])).toBe(false);
    expect(isFrozenExactlyAt(["a", "c"], ["a", "b"])).toBe(false);
    expect(isFrozenExactlyAt(undefined, ["a"])).toBe(false);
  });
});

describe("visibleFieldIdsAfterHide", () => {
  it("filters an explicit visible list", () => {
    expect(visibleFieldIdsAfterHide(["a", "b", "c"], ["x"], "b")).toEqual([
      "a",
      "c",
    ]);
  });

  it("materializes all current fields minus the hidden one when undefined", () => {
    expect(visibleFieldIdsAfterHide(undefined, ["a", "b", "c"], "c")).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("toggledWrapFieldIds", () => {
  it("adds a field not yet wrapped", () => {
    expect(toggledWrapFieldIds(undefined, "a")).toEqual(["a"]);
    expect(toggledWrapFieldIds(["b"], "a")).toEqual(["b", "a"]);
  });

  it("removes a wrapped field", () => {
    expect(toggledWrapFieldIds(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("columnOrderWithInsert", () => {
  const order = ["a", "b", "c"];

  it("splices left of the target", () => {
    expect(columnOrderWithInsert(order, "b", "left", "n")).toEqual([
      "a",
      "n",
      "b",
      "c",
    ]);
  });

  it("splices right of the target", () => {
    expect(columnOrderWithInsert(order, "b", "right", "n")).toEqual([
      "a",
      "b",
      "n",
      "c",
    ]);
  });

  it("appends when the target is unknown", () => {
    expect(columnOrderWithInsert(order, "zz", "left", "n")).toEqual([
      "a",
      "b",
      "c",
      "n",
    ]);
  });
});

describe("calculationsWithSelection", () => {
  it("sets the field's aggregate, keeping other fields", () => {
    expect(calculationsWithSelection({ a: "sum" }, "b", "countAll")).toEqual({
      a: "sum",
      b: "countAll",
    });
  });

  it("removes the field's entry for None", () => {
    expect(
      calculationsWithSelection({ a: "sum", b: "min" }, "b", null)
    ).toEqual({ a: "sum" });
  });

  it("materializes an empty record", () => {
    expect(calculationsWithSelection(undefined, "a", "countAll")).toEqual({
      a: "countAll",
    });
  });
});

describe("fieldTypeChangePatch", () => {
  it("gives selects a fresh empty option list", () => {
    expect(fieldTypeChangePatch("select")).toEqual({
      type: "select",
      options: [],
      format: undefined,
    });
    expect(fieldTypeChangePatch("multiSelect")).toEqual({
      type: "multiSelect",
      options: [],
      format: undefined,
    });
  });

  it("clears per-type config for types without any", () => {
    expect(fieldTypeChangePatch("text")).toEqual({
      type: "text",
      options: undefined,
      format: undefined,
    });
    expect(fieldTypeChangePatch("number")).toEqual({
      type: "number",
      options: undefined,
      format: undefined,
    });
  });
});

describe("select option list edits", () => {
  const options: DatabaseSelectOption[] = [
    { id: "o1", name: "Todo" },
    { id: "o2", name: "Done" },
  ];

  it("renames an option in place, trimming whitespace", () => {
    expect(renamedSelectOptions(options, "o1", " Doing ")).toEqual([
      { id: "o1", name: "Doing" },
      { id: "o2", name: "Done" },
    ]);
  });

  it("ignores blank renames", () => {
    expect(renamedSelectOptions(options, "o1", "   ")).toEqual(options);
  });

  it("appends a new option without a color", () => {
    const next = withAddedSelectOption(options, "Blocked");
    expect(next).toHaveLength(3);
    expect(next[2].name).toBe("Blocked");
    expect(next[2].color).toBeUndefined();
    expect(next[2].id).toBeTruthy();
  });

  it("ignores blank and duplicate option names", () => {
    expect(withAddedSelectOption(options, "  ")).toEqual(options);
    expect(withAddedSelectOption(options, "Done")).toEqual(options);
  });

  it("removes an option by id", () => {
    expect(withoutSelectOption(options, "o1")).toEqual([
      { id: "o2", name: "Done" },
    ]);
  });
});
