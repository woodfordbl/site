import { generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it } from "vitest";

import {
  assignFractionalIndexes,
  sortByFractionalIndex,
} from "@/lib/blocks/fractional-order.ts";

/** Order/index state a page would hold, advanced by applying assignments. */
function makeState(ids: string[], withKeys = true) {
  const keys = withKeys ? generateNKeysBetween(null, null, ids.length) : [];
  return {
    order: [...ids],
    indexById: new Map<string, string | undefined>(
      ids.map((id, index) => [id, withKeys ? keys[index] : undefined])
    ),
  };
}

function applyAssignments(
  state: { order: string[]; indexById: Map<string, string | undefined> },
  nextOrder: string[],
  assigned: Map<string, string>
): void {
  state.order = [...nextOrder];
  const nextIds = new Set(nextOrder);
  for (const id of [...state.indexById.keys()]) {
    if (!nextIds.has(id)) {
      state.indexById.delete(id);
    }
  }
  for (const [id, key] of assigned) {
    state.indexById.set(id, key);
  }
}

function sortedByStateKeys(state: {
  order: string[];
  indexById: Map<string, string | undefined>;
}): string[] {
  const rows = state.order.map((id) => ({
    id,
    fractionalIndex: state.indexById.get(id),
  }));
  return sortByFractionalIndex(rows).map((row) => row.id);
}

describe("assignFractionalIndexes", () => {
  it("returns no assignments when the order is unchanged", () => {
    const state = makeState(["a", "b", "c"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "c",
    ]);
    expect(assigned.size).toBe(0);
  });

  it("assigns only the appended block", () => {
    const state = makeState(["a", "b"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "new",
    ]);

    expect([...assigned.keys()]).toEqual(["new"]);
    const newKey = assigned.get("new") as string;
    expect(newKey > (state.indexById.get("b") as string)).toBe(true);
  });

  it("assigns only the prepended block", () => {
    const state = makeState(["a", "b"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "new",
      "a",
      "b",
    ]);

    expect([...assigned.keys()]).toEqual(["new"]);
    const newKey = assigned.get("new") as string;
    expect(newKey < (state.indexById.get("a") as string)).toBe(true);
  });

  it("assigns a mid-insert strictly between its neighbors", () => {
    const state = makeState(["a", "b", "c"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "new",
      "b",
      "c",
    ]);

    expect([...assigned.keys()]).toEqual(["new"]);
    const newKey = assigned.get("new") as string;
    expect(newKey > (state.indexById.get("a") as string)).toBe(true);
    expect(newKey < (state.indexById.get("b") as string)).toBe(true);
  });

  it("move-to-front reassigns only the moved block", () => {
    const state = makeState(["a", "b", "c", "d"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "d",
      "a",
      "b",
      "c",
    ]);

    expect([...assigned.keys()]).toEqual(["d"]);
    expect(
      (assigned.get("d") as string) < (state.indexById.get("a") as string)
    ).toBe(true);
  });

  it("move-to-back reassigns only the moved block", () => {
    const state = makeState(["a", "b", "c", "d"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "b",
      "c",
      "d",
      "a",
    ]);

    expect([...assigned.keys()]).toEqual(["a"]);
    expect(
      (assigned.get("a") as string) > (state.indexById.get("d") as string)
    ).toBe(true);
  });

  it("returns no assignments for a pure delete", () => {
    const state = makeState(["a", "b", "c"]);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "c",
    ]);
    expect(assigned.size).toBe(0);
  });

  it("assigns every block when none has an index (legacy page)", () => {
    const state = makeState(["a", "b", "c"], false);
    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "c",
    ]);

    expect([...assigned.keys()]).toEqual(["a", "b", "c"]);
    applyAssignments(state, ["a", "b", "c"], assigned);
    expect(sortedByStateKeys(state)).toEqual(["a", "b", "c"]);
  });

  it("fills legacy gaps between indexed neighbors", () => {
    const state = makeState(["a", "b", "c"]);
    state.indexById.set("b", undefined);

    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "c",
    ]);

    expect([...assigned.keys()]).toEqual(["b"]);
    const key = assigned.get("b") as string;
    expect(key > (state.indexById.get("a") as string)).toBe(true);
    expect(key < (state.indexById.get("c") as string)).toBe(true);
  });

  it("interleaved inserts at the same position stay ordered", () => {
    const state = makeState(["a", "b"]);

    // Repeatedly insert between "a" and whatever follows it.
    const inserted: string[] = [];
    for (let round = 0; round < 20; round++) {
      const id = `mid-${round}`;
      const nextOrder = [
        "a",
        id,
        ...state.order.filter((existing) => existing !== "a"),
      ];
      const assigned = assignFractionalIndexes(
        state.order,
        state.indexById,
        nextOrder
      );
      expect([...assigned.keys()]).toEqual([id]);
      applyAssignments(state, nextOrder, assigned);
      inserted.push(id);
    }

    expect(sortedByStateKeys(state)).toEqual(state.order);
    const keys = [...state.indexById.values()] as string[];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("renumbers the inconsistent suffix when stored keys are out of order", () => {
    const state = makeState(["a", "b", "c", "d"]);
    // Corrupt: "b" carries a key larger than everything after it.
    state.indexById.set("b", "z9999");

    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "c",
      "d",
    ]);

    // "b" is the odd one out (longest consistent chain is a,c,d).
    expect([...assigned.keys()]).toEqual(["b"]);
    applyAssignments(state, state.order, assigned);
    expect(sortedByStateKeys(state)).toEqual(["a", "b", "c", "d"]);
  });

  it("reassigns duplicated keys", () => {
    const state = makeState(["a", "b", "c"]);
    state.indexById.set("b", state.indexById.get("a"));

    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "c",
    ]);

    // One of the two duplicates is reassigned (either is correct).
    expect(assigned.size).toBe(1);
    applyAssignments(state, state.order, assigned);
    expect(sortedByStateKeys(state)).toEqual(["a", "b", "c"]);
    const keys = [...state.indexById.values()];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("renumbers the whole page when a kept key is malformed", () => {
    const state = makeState(["a", "b", "c"], false);
    // "0" is not a valid order key head in the default alphabet; keeping it
    // as a neighbor bound makes the generator throw.
    state.indexById.set("a", "0");
    state.indexById.set("b", "1");

    const assigned = assignFractionalIndexes(state.order, state.indexById, [
      "a",
      "b",
      "c",
    ]);

    expect([...assigned.keys()]).toEqual(["a", "b", "c"]);
    applyAssignments(state, state.order, assigned);
    expect(sortedByStateKeys(state)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty map for an empty next order", () => {
    const state = makeState(["a"]);
    expect(assignFractionalIndexes(state.order, state.indexById, []).size).toBe(
      0
    );
  });

  it("property: random edit sequences always round-trip through the sort", () => {
    // Deterministic LCG so failures reproduce.
    let seed = 42;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
      return seed / 4_294_967_296;
    };
    const pick = (bound: number) => Math.floor(random() * bound);

    const state = makeState(["a", "b", "c"], false);
    let nextId = 0;

    for (let step = 0; step < 200; step++) {
      const nextOrder = [...state.order];
      const action = pick(3);
      if (action === 0 || nextOrder.length === 0) {
        nextOrder.splice(pick(nextOrder.length + 1), 0, `n${nextId++}`);
      } else if (action === 1 && nextOrder.length > 1) {
        const [moved] = nextOrder.splice(pick(nextOrder.length), 1);
        nextOrder.splice(pick(nextOrder.length + 1), 0, moved);
      } else {
        nextOrder.splice(pick(nextOrder.length), 1);
      }

      const assigned = assignFractionalIndexes(
        state.order,
        state.indexById,
        nextOrder
      );
      // In-sequence blocks with keys must never be reassigned once indexed.
      const previousKeys = new Map(state.indexById);
      applyAssignments(state, nextOrder, assigned);

      expect(sortedByStateKeys(state)).toEqual(nextOrder);
      for (const [id, key] of state.indexById) {
        expect(key).toBeDefined();
        const previous = previousKeys.get(id);
        if (previous !== undefined && !assigned.has(id)) {
          expect(key).toBe(previous);
        }
      }
    }
  });
});

describe("sortByFractionalIndex", () => {
  it("sorts rows lexicographically by index", () => {
    const rows = [
      { id: "c", fractionalIndex: "a3" },
      { id: "a", fractionalIndex: "a1" },
      { id: "b", fractionalIndex: "a2" },
    ];
    expect(sortByFractionalIndex(rows).map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("breaks equal-index ties deterministically by id", () => {
    const rows = [
      { id: "b", fractionalIndex: "a1" },
      { id: "a", fractionalIndex: "a1" },
    ];
    expect(sortByFractionalIndex(rows).map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
    expect(
      sortByFractionalIndex([...rows].reverse()).map((row) => row.id)
    ).toEqual(["a", "b"]);
  });

  it("orders fully legacy rows by the fallback order", () => {
    const rows = [{ id: "c" }, { id: "a" }, { id: "b" }];
    expect(
      sortByFractionalIndex(rows, ["a", "b", "c"]).map((row) => row.id)
    ).toEqual(["a", "b", "c"]);
  });

  it("appends legacy rows missing from the fallback after ordered ones, in input order", () => {
    const rows = [{ id: "x" }, { id: "a" }, { id: "y" }, { id: "b" }];
    expect(
      sortByFractionalIndex(rows, ["b", "a"]).map((row) => row.id)
    ).toEqual(["b", "a", "x", "y"]);
  });

  it("appends legacy rows last when no fallback is given", () => {
    const rows = [
      { id: "legacy" },
      { id: "b", fractionalIndex: "a2" },
      { id: "a", fractionalIndex: "a1" },
    ];
    expect(sortByFractionalIndex(rows).map((row) => row.id)).toEqual([
      "a",
      "b",
      "legacy",
    ]);
  });

  it("places a legacy row between indexed rows per the fallback order", () => {
    const rows = [
      { id: "x", fractionalIndex: "a1" },
      { id: "legacy" },
      { id: "y", fractionalIndex: "a2" },
    ];
    expect(
      sortByFractionalIndex(rows, ["x", "legacy", "y"]).map((row) => row.id)
    ).toEqual(["x", "legacy", "y"]);
  });

  it("places a legacy row with no placed predecessor at the front", () => {
    const rows = [{ id: "x", fractionalIndex: "a1" }, { id: "legacy" }];
    expect(
      sortByFractionalIndex(rows, ["legacy", "x"]).map((row) => row.id)
    ).toEqual(["legacy", "x"]);
  });

  it("does not mutate its input", () => {
    const rows = [
      { id: "b", fractionalIndex: "a2" },
      { id: "a", fractionalIndex: "a1" },
    ];
    const input = [...rows];
    sortByFractionalIndex(rows);
    expect(rows).toEqual(input);
  });
});
