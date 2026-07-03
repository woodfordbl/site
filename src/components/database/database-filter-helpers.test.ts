import { describe, expect, it } from "vitest";

import {
  appendFilterCondition,
  conditionOptionIds,
  conditionValueLabel,
  innerGroupChipLabel,
  isFilterInnerGroup,
  patchFilterCondition,
  removeFilterEntry,
  setFilterOp,
  toggleConditionOptionId,
} from "@/components/database/database-filter-helpers.ts";
import type {
  DatabaseField,
  DatabaseFilterCondition,
  DatabaseFilterGroup,
  DatabaseFilterInnerGroup,
} from "@/lib/schemas/database.ts";

const condition = (
  overrides: Partial<DatabaseFilterCondition> = {}
): DatabaseFilterCondition => ({
  id: "c1",
  fieldId: "f1",
  operator: "contains",
  ...overrides,
});

const innerGroup: DatabaseFilterInnerGroup = {
  id: "g1",
  op: "or",
  conditions: [condition({ id: "c2" }), condition({ id: "c3" })],
};

const selectField: DatabaseField = {
  id: "f1",
  name: "Status",
  type: "select",
  options: [
    { id: "o1", name: "Active" },
    { id: "o2", name: "Paused", color: "green" },
    { id: "o3", name: "Done" },
  ],
};

describe("isFilterInnerGroup", () => {
  it("distinguishes groups from conditions", () => {
    expect(isFilterInnerGroup(innerGroup)).toBe(true);
    expect(isFilterInnerGroup(condition())).toBe(false);
  });
});

describe("appendFilterCondition", () => {
  it("creates an and-root group when there is no filter", () => {
    expect(appendFilterCondition(undefined, condition())).toEqual({
      op: "and",
      conditions: [condition()],
    });
  });

  it("appends to an existing root, preserving its op", () => {
    const filter: DatabaseFilterGroup = { op: "or", conditions: [condition()] };
    const next = appendFilterCondition(filter, condition({ id: "c9" }));
    expect(next.op).toBe("or");
    expect(next.conditions).toHaveLength(2);
  });
});

describe("removeFilterEntry", () => {
  it("removes a condition by id", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [condition(), condition({ id: "c9" })],
    };
    expect(removeFilterEntry(filter, "c1")?.conditions).toEqual([
      condition({ id: "c9" }),
    ]);
  });

  it("removes an inner group by id", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [condition(), innerGroup],
    };
    expect(removeFilterEntry(filter, "g1")?.conditions).toEqual([condition()]);
  });

  it("clears the filter entirely when the last entry goes", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [condition()],
    };
    expect(removeFilterEntry(filter, "c1")).toBeUndefined();
  });
});

describe("patchFilterCondition", () => {
  it("merges operator and value into the matching condition", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [condition({ value: "draft" })],
    };
    const next = patchFilterCondition(filter, "c1", {
      operator: "eq",
      value: "done",
    });
    expect(next.conditions[0]).toEqual(
      condition({ operator: "eq", value: "done" })
    );
  });

  it("strips the value when patched to undefined", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [condition({ value: "draft" })],
    };
    const next = patchFilterCondition(filter, "c1", {
      operator: "isEmpty",
      value: undefined,
    });
    const patched = next.conditions[0];
    expect(!isFilterInnerGroup(patched) && patched.value).toBeUndefined();
  });

  it("leaves inner groups and other conditions untouched", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [innerGroup, condition({ id: "c9" })],
    };
    const next = patchFilterCondition(filter, "c1", { operator: "eq" });
    expect(next.conditions).toEqual(filter.conditions);
  });
});

describe("setFilterOp", () => {
  it("switches the root op", () => {
    const filter: DatabaseFilterGroup = {
      op: "and",
      conditions: [condition()],
    };
    expect(setFilterOp(filter, "or").op).toBe("or");
  });
});

describe("conditionOptionIds", () => {
  it("wraps a bare id, passes arrays through, drops everything else", () => {
    expect(conditionOptionIds("o1")).toEqual(["o1"]);
    expect(conditionOptionIds(["o1", "o2"])).toEqual(["o1", "o2"]);
    expect(conditionOptionIds(undefined)).toEqual([]);
    expect(conditionOptionIds("")).toEqual([]);
    expect(conditionOptionIds(3)).toEqual([]);
  });
});

describe("toggleConditionOptionId", () => {
  it("stores a single selection as a bare id", () => {
    expect(toggleConditionOptionId(undefined, "o1")).toBe("o1");
  });

  it("grows to an array on the second selection", () => {
    expect(toggleConditionOptionId("o1", "o2")).toEqual(["o1", "o2"]);
  });

  it("collapses back to a bare id and then to undefined", () => {
    expect(toggleConditionOptionId(["o1", "o2"], "o2")).toBe("o1");
    expect(toggleConditionOptionId("o1", "o1")).toBeUndefined();
  });
});

describe("conditionValueLabel", () => {
  const textField: DatabaseField = { id: "f1", name: "Name", type: "text" };

  it("returns empty for valueless operators", () => {
    expect(
      conditionValueLabel(textField, condition({ operator: "isEmpty" }))
    ).toBe("");
  });

  it("shows string values as-is", () => {
    expect(conditionValueLabel(textField, condition({ value: "hello" }))).toBe(
      "hello"
    );
  });

  it("formats numbers with the field's number format", () => {
    const numberField: DatabaseField = {
      id: "f1",
      name: "Total",
      type: "number",
      format: "currency",
    };
    expect(
      conditionValueLabel(
        numberField,
        condition({ operator: "gt", value: 1200 })
      )
    ).toBe("$1,200.00");
  });

  it("lists select option names up to two, then collapses", () => {
    expect(
      conditionValueLabel(
        selectField,
        condition({ operator: "eq", value: "o1" })
      )
    ).toBe("Active");
    expect(
      conditionValueLabel(
        selectField,
        condition({ operator: "eq", value: ["o1", "o2"] })
      )
    ).toBe("Active, Paused");
    expect(
      conditionValueLabel(
        selectField,
        condition({ operator: "eq", value: ["o1", "o2", "o3"] })
      )
    ).toBe("3 selected");
  });

  it("drops stale option ids", () => {
    expect(
      conditionValueLabel(
        selectField,
        condition({ operator: "eq", value: ["o1", "gone"] })
      )
    ).toBe("Active");
  });

  it("labels checkbox targets, treating unset as unchecked", () => {
    const checkboxField: DatabaseField = {
      id: "f1",
      name: "Done",
      type: "checkbox",
    };
    expect(
      conditionValueLabel(
        checkboxField,
        condition({ operator: "eq", value: true })
      )
    ).toBe("Checked");
    expect(
      conditionValueLabel(checkboxField, condition({ operator: "eq" }))
    ).toBe("Unchecked");
  });

  it("formats date values for display", () => {
    const dateField: DatabaseField = { id: "f1", name: "Due", type: "date" };
    expect(
      conditionValueLabel(
        dateField,
        condition({ operator: "eq", value: "2026-03-05" })
      )
    ).toBe("Mar 5, 2026");
  });
});

describe("innerGroupChipLabel", () => {
  it("summarizes count and op", () => {
    expect(innerGroupChipLabel(innerGroup)).toBe("(2 conditions · or)");
    expect(
      innerGroupChipLabel({ id: "g2", op: "and", conditions: [condition()] })
    ).toBe("(1 condition · and)");
  });
});
