import { describe, expect, it } from "vitest";

import {
  aggregateFnsForFieldType,
  calculationsWithSelection,
  columnOrderWithInsert,
  expressionPatch,
  fieldTypeChangePatch,
  freezePrefixEndingAt,
  isFrozenExactlyAt,
  logicalColumnOrder,
  recoloredSelectOptions,
  renamedSelectOptions,
  selectFieldForOptionEdit,
  toggledWrapFieldIds,
  visibleFieldIdsAfterHide,
  withAddedSelectOption,
  withoutSelectOption,
} from "@/components/database/database-column-menu-helpers.ts";
import type {
  DatabaseField,
  DatabaseSelectOption,
} from "@/lib/schemas/database.ts";

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

describe("logicalColumnOrder", () => {
  it("returns schema order when no order is stored", () => {
    expect(logicalColumnOrder(undefined, ["a", "b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(logicalColumnOrder([], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("resolves the stored order first, then remaining fields in schema order", () => {
    expect(logicalColumnOrder(["c", "a"], ["a", "b", "c", "d"])).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
  });

  it("drops stale and duplicate stored ids", () => {
    expect(logicalColumnOrder(["gone", "b", "b"], ["a", "b"])).toEqual([
      "b",
      "a",
    ]);
  });

  it("keeps hidden fields in the insert base so an insert never loses their position", () => {
    // Fields a,b,c,d with b hidden (absent from the DISPLAY order) and no
    // stored order: inserting right of `a` against the logical order keeps
    // b at its schema position instead of pushing it to the end on unhide.
    const base = logicalColumnOrder(undefined, ["a", "b", "c", "d"]);
    expect(columnOrderWithInsert(base, "a", "right", "n")).toEqual([
      "a",
      "n",
      "b",
      "c",
      "d",
    ]);
  });
});

describe("selectFieldForOptionEdit", () => {
  const options: DatabaseSelectOption[] = [{ id: "o1", name: "Active" }];
  const source: DatabaseField = {
    id: "f1",
    name: "Status",
    type: "select",
    options,
  };
  // "Duplicate property" clones share option ids with their source — the
  // lookup must scope by field id, never scan for the option id.
  const copy: DatabaseField = {
    id: "f2",
    name: "Status (1)",
    type: "multiSelect",
    options: [{ id: "o1", name: "Active" }],
  };

  it("resolves the exact field even when a duplicate shares option ids", () => {
    expect(selectFieldForOptionEdit([source, copy], "f2")).toBe(copy);
    expect(selectFieldForOptionEdit([source, copy], "f1")).toBe(source);
  });

  it("returns undefined for unknown ids and non-select fields", () => {
    const text: DatabaseField = { id: "f3", name: "Notes", type: "text" };
    expect(selectFieldForOptionEdit([source, text], "f3")).toBeUndefined();
    expect(selectFieldForOptionEdit([source, text], "zz")).toBeUndefined();
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

  it("gives formulas a fresh empty expression", () => {
    expect(fieldTypeChangePatch("formula")).toEqual({
      type: "formula",
      options: undefined,
      format: undefined,
      expression: "",
    });
  });
});

describe("expressionPatch", () => {
  it("carries the expression source only", () => {
    expect(expressionPatch("thisPage.Price * 1.1")).toEqual({
      expression: "thisPage.Price * 1.1",
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

  it("recolors an option in place without touching siblings", () => {
    expect(recoloredSelectOptions(options, "o2", "blue")).toEqual([
      { id: "o1", name: "Todo" },
      { id: "o2", name: "Done", color: "blue" },
    ]);
  });

  it("clears an option color with undefined", () => {
    const colored: DatabaseSelectOption[] = [
      { id: "o1", name: "Todo", color: "red" },
    ];
    expect(recoloredSelectOptions(colored, "o1", undefined)[0].color).toBe(
      undefined
    );
  });

  it("leaves the list unchanged for unknown option ids", () => {
    expect(recoloredSelectOptions(options, "missing", "green")).toEqual(
      options
    );
  });
});
