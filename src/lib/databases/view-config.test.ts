import { describe, expect, it } from "vitest";

import {
  isFieldWrapped,
  resolveColumnOrder,
  resolvePinnedFields,
} from "@/lib/databases/view-config.ts";
import type { DatabaseField, DatabaseView } from "@/lib/schemas/database.ts";

const fieldA: DatabaseField = { id: "a", name: "Name", type: "text" };
const fieldB: DatabaseField = { id: "b", name: "Amount", type: "number" };
const fieldC: DatabaseField = { id: "c", name: "Done", type: "checkbox" };

const fields = [fieldA, fieldB, fieldC];

function makeView(overrides: Partial<DatabaseView> = {}): DatabaseView {
  return { id: "v1", name: "Table", type: "table", config: {}, ...overrides };
}

function orderedIds(view: DatabaseView): string[] {
  return resolveColumnOrder(fields, view).map((field) => field.id);
}

describe("resolveColumnOrder", () => {
  it("returns schema order without a configured column order", () => {
    expect(orderedIds(makeView())).toEqual(["a", "b", "c"]);
  });

  it("puts configured columns first, then remaining fields in schema order", () => {
    expect(orderedIds(makeView({ config: { columnOrder: ["c"] } }))).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("drops unknown and duplicate ids from the column order", () => {
    expect(
      orderedIds(makeView({ config: { columnOrder: ["ghost", "b", "b"] } }))
    ).toEqual(["b", "a", "c"]);
  });

  it("excludes fields hidden via visibleFieldIds", () => {
    expect(
      orderedIds(
        makeView({
          visibleFieldIds: ["c", "a"],
          config: { columnOrder: ["b", "c"] },
        })
      )
    ).toEqual(["c", "a"]);
  });
});

describe("resolvePinnedFields", () => {
  it("resolves pinned fields in pin order", () => {
    const view = makeView({ config: { pinnedFieldIds: ["b", "a"] } });
    expect(resolvePinnedFields(fields, view).map((field) => field.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("drops unknown and hidden ids", () => {
    const view = makeView({
      visibleFieldIds: ["a", "b"],
      config: { pinnedFieldIds: ["ghost", "c", "a"] },
    });
    expect(resolvePinnedFields(fields, view).map((field) => field.id)).toEqual([
      "a",
    ]);
  });

  it("returns no pins without config", () => {
    expect(resolvePinnedFields(fields, makeView())).toEqual([]);
  });
});

describe("isFieldWrapped", () => {
  it("reads per-column wrap from view config", () => {
    const view = makeView({ config: { wrapFieldIds: ["b"] } });
    expect(isFieldWrapped(view, "b")).toBe(true);
    expect(isFieldWrapped(view, "a")).toBe(false);
    expect(isFieldWrapped(makeView(), "b")).toBe(false);
  });
});
