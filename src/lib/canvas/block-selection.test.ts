import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import {
  emptyBlockSelection,
  expandListContainerSelection,
  expandRowIdsForDelete,
  rangeRowIdsBetween,
  selectionIncludesAllListChildren,
  toggleBlockSelection,
} from "@/lib/canvas/block-selection.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("block selection", () => {
  const serverBlocks: Block[] = [
    { id: "p1", type: "text", props: { text: "One" } },
    { id: "p2", type: "text", props: { text: "Two" } },
    { id: "p3", type: "text", props: { text: "Three" } },
  ];

  it("shift+click selects a contiguous range", () => {
    const rows = buildBlockTree(serverBlocks);
    const first = rows[0]?.rowId;
    const third = rows[2]?.rowId;
    expect(first && third).toBeTruthy();
    if (!(first && third)) {
      return;
    }

    const selected = toggleBlockSelection(
      rows,
      { selectedRowIds: [first], anchorRowId: first },
      third,
      { shiftKey: true }
    );

    expect(selected.selectedRowIds).toHaveLength(3);
  });

  it("shift+click with focusRowId as anchor selects range when selection is empty", () => {
    const rows = buildBlockTree(serverBlocks);
    const first = rows[0]?.rowId;
    const third = rows[2]?.rowId;
    expect(first && third).toBeTruthy();
    if (!(first && third)) {
      return;
    }

    const selected = toggleBlockSelection(
      rows,
      emptyBlockSelection,
      third,
      { shiftKey: true },
      first
    );

    expect(selected.anchorRowId).toBe(first);
    expect(selected.selectedRowIds).toHaveLength(3);
    expect(selected.selectedRowIds[0]).toBe(first);
    expect(selected.selectedRowIds[2]).toBe(third);
  });

  it("shift+click prefers selection anchor over focusRowId", () => {
    const rows = buildBlockTree(serverBlocks);
    const first = rows[0]?.rowId;
    const second = rows[1]?.rowId;
    const third = rows[2]?.rowId;
    expect(first && second && third).toBeTruthy();
    if (!(first && second && third)) {
      return;
    }

    const selected = toggleBlockSelection(
      rows,
      { selectedRowIds: [first], anchorRowId: first },
      third,
      { shiftKey: true },
      second
    );

    expect(selected.anchorRowId).toBe(first);
    expect(selected.selectedRowIds).toHaveLength(3);
  });

  it("shift+click range stays within the same column", () => {
    const rows = buildBlockTree([
      { id: "cols", type: "columns", props: {} },
      { id: "col1", type: "column", parentId: "cols", props: { width: 1 } },
      { id: "col2", type: "column", parentId: "cols", props: { width: 1 } },
      { id: "a1", type: "text", parentId: "col1", props: { text: "A1" } },
      { id: "a2", type: "text", parentId: "col1", props: { text: "A2" } },
      { id: "b1", type: "text", parentId: "col2", props: { text: "B1" } },
    ]);

    expect(rangeRowIdsBetween(rows, "a2", "a1")).toEqual(["a1", "a2"]);
    expect(rangeRowIdsBetween(rows, "a2", "b1")).toEqual(["a2", "col2", "b1"]);
  });

  it("shift+click in a column selects only sibling blocks", () => {
    const rows = buildBlockTree([
      { id: "cols", type: "columns", props: {} },
      { id: "col1", type: "column", parentId: "cols", props: { width: 1 } },
      { id: "col2", type: "column", parentId: "cols", props: { width: 1 } },
      { id: "a1", type: "text", parentId: "col1", props: { text: "A1" } },
      { id: "a2", type: "text", parentId: "col1", props: { text: "A2" } },
      { id: "b1", type: "text", parentId: "col2", props: { text: "B1" } },
    ]);

    const selected = toggleBlockSelection(
      rows,
      { selectedRowIds: ["a2"], anchorRowId: "a2" },
      "a1",
      { shiftKey: true }
    );

    expect(selected.selectedRowIds).toEqual(["a1", "a2"]);
  });

  it("shift+click with no anchor or focus selects only the clicked row", () => {
    const rows = buildBlockTree(serverBlocks);
    const second = rows[1]?.rowId;
    expect(second).toBeTruthy();
    if (!second) {
      return;
    }

    const selected = toggleBlockSelection(rows, emptyBlockSelection, second, {
      shiftKey: true,
    });

    expect(selected.anchorRowId).toBe(second);
    expect(selected.selectedRowIds).toEqual([second]);
  });

  it("expandRowIdsForDelete includes list children", () => {
    const rows = buildBlockTree([
      {
        id: "list1",
        type: "list",
        props: { variant: "bullet" },
      },
      {
        id: "item1",
        type: "text",
        parentId: "list1",
        props: { text: "Item" },
      },
    ]);
    const listRow = rows[0];
    expect(listRow).toBeDefined();
    if (!listRow) {
      return;
    }

    const expanded = expandRowIdsForDelete(rows, [listRow.rowId]);
    expect(expanded.length).toBeGreaterThan(1);
  });

  it("selecting a list container selects all list item rows", () => {
    const rows = buildBlockTree([
      {
        id: "list1",
        type: "list",
        props: { variant: "bullet" },
      },
      {
        id: "item1",
        type: "text",
        parentId: "list1",
        props: { text: "One" },
      },
      {
        id: "item2",
        type: "text",
        parentId: "list1",
        props: { text: "Two" },
      },
    ]);
    const listRow = rows[0];
    expect(listRow).toBeDefined();
    if (!listRow) {
      return;
    }

    const selected = toggleBlockSelection(
      rows,
      emptyBlockSelection,
      listRow.rowId
    );

    expect(selected.selectedRowIds).toEqual(["item1", "item2"]);
    expect(
      selectionIncludesAllListChildren(rows, selected, listRow.rowId)
    ).toBe(true);
    expect(expandListContainerSelection(rows, listRow.rowId)).toEqual([
      "item1",
      "item2",
    ]);
  });

  it("toggles off list container selection when all children are selected", () => {
    const rows = buildBlockTree([
      {
        id: "list1",
        type: "list",
        props: { variant: "bullet" },
      },
      {
        id: "item1",
        type: "text",
        parentId: "list1",
        props: { text: "One" },
      },
    ]);
    const listRow = rows[0];
    expect(listRow).toBeDefined();
    if (!listRow) {
      return;
    }

    const selected = toggleBlockSelection(
      rows,
      { selectedRowIds: ["item1"], anchorRowId: listRow.rowId },
      listRow.rowId
    );

    expect(selected).toEqual(emptyBlockSelection);
  });
});

describe("selection commands", () => {
  it("selection.delete emits delete effects in reverse order", () => {
    const serverBlocks: Block[] = [
      { id: "p1", type: "text", props: { text: "One" } },
      { id: "p2", type: "text", props: { text: "Two" } },
    ];
    const rows = buildBlockTree(serverBlocks);
    const result = canvasReducer(
      { rows },
      {
        type: "selection.delete",
        rowIds: [rows[0]?.rowId ?? "", rows[1]?.rowId ?? ""],
      }
    );
    expect(
      result.effects.filter((effect) => effect.type === "delete")
    ).toHaveLength(2);
  });

  it("rows.paste inserts cloned blocks with new ids after target", () => {
    const serverBlocks: Block[] = [
      { id: "p1", type: "text", props: { text: "One" } },
    ];
    const rows = buildBlockTree(serverBlocks);
    const target = rows[0];
    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const sourceBlock = {
      id: "copy1",
      type: "text" as const,
      props: { text: "Copied" },
    };

    const result = canvasReducer(
      { rows },
      {
        type: "rows.paste",
        targetRowId: target.rowId,
        blocks: [sourceBlock],
      }
    );

    const insertEffects = result.effects.filter(
      (effect) => effect.type === "insert"
    );
    expect(insertEffects).toHaveLength(1);
    const inserted = insertEffects[0];
    if (inserted?.type !== "insert") {
      return;
    }
    expect(inserted.block.id).not.toBe(sourceBlock.id);
    expect(inserted.block.props).toEqual(sourceBlock.props);
  });
});
