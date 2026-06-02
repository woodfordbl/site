import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/db/queries/merge-blocks.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("canvasReducer", () => {
  const serverBlocks: Block[] = [
    { id: "p1", type: "text", props: { text: "Hello" } },
  ];

  it("row.insert emits insert effect", () => {
    const rows = buildBlockTree(serverBlocks);
    const result = canvasReducer(
      { rows, serverBlocks },
      {
        type: "row.insert",
        position: { parentId: null, atScopeStart: true },
      }
    );
    expect(result.effects.some((e) => e.type === "insert")).toBe(true);
  });

  it("indent.adjust emits persist", () => {
    const rows = buildBlockTree(serverBlocks);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks },
      { type: "indent.adjust", rowId: row.rowId, delta: 1 }
    );
    expect(result.effects[0]?.type).toBe("persist");
  });

  it("row.split persists trimmed block and inserts remainder", () => {
    const rows = buildBlockTree(serverBlocks);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks },
      { type: "row.split", rowId: row.rowId, start: 2, end: 2 }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    const insert = result.effects.find((e) => e.type === "insert");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.block.props).toEqual({ text: "He" });
    }
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.props).toEqual({ text: "llo" });
    }
  });

  it("row.split at end of heading inserts a text block", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "heading", props: { level: 1, text: "Title" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      { type: "row.split", rowId: row.rowId, start: 5, end: 5 }
    );
    const insert = result.effects.find((e) => e.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.type).toBe("text");
      expect(insert.block.props).toEqual({ text: "" });
    }
  });

  it("row.split in middle of heading keeps heading for remainder", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "heading", props: { level: 2, text: "Title" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      { type: "row.split", rowId: row.rowId, start: 2, end: 2 }
    );
    const insert = result.effects.find((e) => e.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.type).toBe("heading");
      expect(insert.block.props).toEqual({ level: 2, text: "tle" });
    }
  });

  it("row.split at caret 0 inserts an empty row before and focuses original row", () => {
    const rows = buildBlockTree(serverBlocks);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks },
      { type: "row.split", rowId: row.rowId, start: 0, end: 0 }
    );
    expect(result.effects.some((e) => e.type === "persist")).toBe(false);
    const insert = result.effects.find((e) => e.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.props).toEqual({ text: "" });
      expect(insert.focus).toBe(false);
    }
    const focus = result.effects.find((e) => e.type === "focus");
    expect(focus?.type).toBe("focus");
    if (focus?.type === "focus") {
      expect(focus.rowId).toBe(row.rowId);
      expect(focus.placement).toBe("start");
    }
  });

  it("row.split at caret 0 on non-empty list item lifts out as text", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "Hello" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const listRow = rows[0];
    expect(listRow).toBeDefined();
    const itemRow = listRow?.children[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      { type: "row.split", rowId: itemRow.rowId, start: 0, end: 0 }
    );
    expect(
      result.effects.some((e) => e.type === "delete" && e.rowId === "item-1")
    ).toBe(false);
    const lifted = result.effects.find(
      (e) => e.type === "persist" && e.rowId === "item-1"
    );
    expect(lifted?.type).toBe("persist");
    if (lifted?.type === "persist") {
      expect(lifted.block).toMatchObject({
        type: "text",
        parentId: null,
        props: { text: "Hello" },
      });
    }
    expect(
      result.effects.some((e) => e.type === "move" && e.rowId === "item-1")
    ).toBe(true);
    const focusEffect = result.effects.find(
      (e) => e.type === "focus" && e.rowId === "item-1"
    );
    expect(focusEffect).toMatchObject({
      type: "focus",
      placement: "start",
      offset: 0,
    });
  });

  it("row.split twice on list item ends as top-level text", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "Hello" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemRow = rows[0]?.children[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) {
      return;
    }

    const afterSibling = canvasReducer(
      { rows, serverBlocks: listBlocks },
      { type: "row.split", rowId: itemRow.rowId, start: 5, end: 5 }
    );
    const newItemInsert = afterSibling.effects.find((e) => e.type === "insert");
    expect(newItemInsert?.type).toBe("insert");
    if (newItemInsert?.type !== "insert") {
      return;
    }
    const newItemId = newItemInsert.block.id;
    const blocksAfterSibling: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "Hello" },
      },
      {
        id: newItemId,
        type: "text",
        parentId: "list-1",
        props: { text: "" },
      },
    ];
    const rowsAfterSibling = buildBlockTree(blocksAfterSibling);

    const afterLift = canvasReducer(
      { rows: rowsAfterSibling, serverBlocks: blocksAfterSibling },
      { type: "row.split", rowId: newItemId, start: 0, end: 0 }
    );
    const lifted = afterLift.effects.find(
      (e) => e.type === "persist" && e.rowId === newItemId
    );
    expect(lifted?.type).toBe("persist");
    if (lifted?.type === "persist") {
      expect(lifted.block).toMatchObject({
        type: "text",
        parentId: null,
        props: { text: "" },
      });
    }
    const focusEffect = afterLift.effects.find(
      (e) => e.type === "focus" && e.rowId === newItemId
    );
    expect(focusEffect).toMatchObject({
      type: "focus",
      placement: "start",
      offset: 0,
    });
  });

  it("row.split on empty list item lifts out to a text block", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-a",
        type: "text",
        parentId: "list-1",
        props: { text: "A" },
      },
      {
        id: "item-b",
        type: "text",
        parentId: "list-1",
        props: { text: "" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemB = rows[0]?.children[1];
    expect(itemB).toBeDefined();
    if (!itemB) {
      return;
    }

    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      { type: "row.split", rowId: itemB.rowId, start: 0, end: 0 }
    );

    expect(
      result.effects.some((e) => e.type === "delete" && e.rowId === "item-b")
    ).toBe(false);
    const lifted = result.effects.find(
      (e) => e.type === "persist" && e.rowId === "item-b"
    );
    expect(lifted?.type).toBe("persist");
    if (lifted?.type === "persist") {
      expect(lifted.block).toMatchObject({
        type: "text",
        parentId: null,
        props: { text: "" },
      });
    }
    const focusEffect = result.effects.find(
      (e) => e.type === "focus" && e.rowId === "item-b"
    );
    expect(focusEffect).toMatchObject({
      type: "focus",
      placement: "start",
      offset: 0,
    });
  });

  it("block.liftAsText on sole empty list item replaces list with text", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "ordered" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        indent: 1,
        props: { text: "" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemRow = rows[0]?.children[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      { type: "block.liftAsText", rowId: itemRow.rowId }
    );
    const deletes = result.effects.filter((e) => e.type === "delete");
    expect(deletes.map((e) => (e.type === "delete" ? e.rowId : null))).toEqual([
      rows[0]?.rowId,
    ]);
    const persist = result.effects.find(
      (e) => e.type === "persist" && e.rowId === itemRow.rowId
    );
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.block).toMatchObject({
        type: "text",
        indent: 1,
        parentId: null,
        props: { text: "" },
      });
    }
    const focus = result.effects.find((e) => e.type === "focus");
    expect(focus?.type).toBe("focus");
    if (focus?.type === "focus") {
      expect(focus.rowId).toBe(itemRow.rowId);
    }
  });

  it("block.mergeTextIntoPreviousSibling focuses at the merge junction", () => {
    const blocks: Block[] = [
      { id: "empty", type: "text", props: { text: "" } },
      { id: "text", type: "text", props: { text: "Hello" } },
    ];
    const rows = buildBlockTree(blocks);
    const textRow = rows[1];
    expect(textRow).toBeDefined();
    if (!textRow) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "block.mergeTextIntoPreviousSibling", rowId: textRow.rowId }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.rowId).toBe("empty");
      expect(persist.block.props).toEqual({ text: "Hello" });
    }
    expect(result.effects.some((e) => e.type === "delete")).toBe(true);
    const focus = result.effects.find((e) => e.type === "focus");
    expect(focus?.type).toBe("focus");
    if (focus?.type === "focus") {
      expect(focus.rowId).toBe("empty");
      expect(focus.offset).toBe(0);
    }
  });

  it("block.mergeTextIntoPreviousSibling focuses at junction when previous sibling had text", () => {
    const blocks: Block[] = [
      { id: "first", type: "text", props: { text: "World" } },
      { id: "second", type: "text", props: { text: "Hello" } },
    ];
    const rows = buildBlockTree(blocks);
    const secondRow = rows[1];
    expect(secondRow).toBeDefined();
    if (!secondRow) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "block.mergeTextIntoPreviousSibling", rowId: secondRow.rowId }
    );
    const focus = result.effects.find((e) => e.type === "focus");
    expect(focus?.type).toBe("focus");
    if (focus?.type === "focus") {
      expect(focus.rowId).toBe("first");
      expect(focus.offset).toBe(5);
    }
  });

  it("slash.convert strips slash command text via options", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "text", props: { text: "/head" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      { type: "slash.convert", rowId: row.rowId, to: "heading", text: "" }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.block.type).toBe("heading");
      expect(persist.block.props).toEqual({ level: 1, text: "" });
    }
  });

  it("slash.convert applies heading level from slash menu", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "text", props: { text: "" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      {
        type: "slash.convert",
        rowId: row.rowId,
        to: "heading",
        text: "Title",
        headingLevel: 2,
      }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.block.props).toEqual({ level: 2, text: "Title" });
    }
  });

  it("container.wrap persists list on row id and inserts child with parentId", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "text", props: { text: "Item" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      {
        type: "container.wrap",
        rowId: row.rowId,
        containerType: "list",
        variant: "bullet",
        childText: "Item",
      }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    const insert = result.effects.find((e) => e.type === "insert");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.rowId).toBe("p1");
      expect(persist.block.type).toBe("list");
      expect(persist.block.id).toBe("p1");
    }
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.type).toBe("text");
      expect(insert.block.id).not.toBe("p1");
      expect(insert.block.parentId).toBe("p1");
      expect(insert.block.props).toEqual({ text: "Item" });
      expect(insert.position.parentId).toBe("p1");
    }
  });

  it("container.wrap persists checklist on row id and inserts checklistItem child", () => {
    const rows = buildBlockTree([
      { id: "p1", type: "text", props: { text: "Buy milk" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      {
        type: "container.wrap",
        rowId: row.rowId,
        containerType: "checklist",
        childText: "Buy milk",
      }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    const insert = result.effects.find((e) => e.type === "insert");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.rowId).toBe("p1");
      expect(persist.block.type).toBe("checklist");
      expect(persist.block.id).toBe("p1");
      expect(persist.block.props).toEqual({});
    }
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.type).toBe("checklistItem");
      expect(insert.block.id).not.toBe("p1");
      expect(insert.block.parentId).toBe("p1");
      expect(insert.block.props).toEqual({ text: "Buy milk", checked: false });
      expect(insert.position.parentId).toBe("p1");
    }
  });

  it("row.split in checklist inserts another checklistItem sibling", () => {
    const blocks: Block[] = [
      { id: "cl-1", type: "checklist", props: {} },
      {
        id: "item-1",
        type: "checklistItem",
        parentId: "cl-1",
        props: { text: "One", checked: false },
      },
    ];
    const rows = buildBlockTree(blocks);
    const itemRow = rows[0]?.children[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "row.split", rowId: itemRow.rowId, start: 3, end: 3 }
    );
    const insert = result.effects.find((e) => e.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.type).toBe("checklistItem");
      expect(insert.block.parentId).toBe("cl-1");
      expect(insert.block.props).toEqual({ text: "", checked: false });
    }
  });

  it("row.moveAdjacent moves a row before or after the focusable neighbor", () => {
    const blocks: Block[] = [
      { id: "a", type: "text", props: { text: "A" } },
      { id: "b", type: "text", props: { text: "B" } },
      { id: "c", type: "text", props: { text: "C" } },
    ];
    const rows = buildBlockTree(blocks);
    const rowB = rows[1];
    const rowC = rows[2];
    expect(rowB).toBeDefined();
    expect(rowC).toBeDefined();
    if (!(rowB && rowC)) {
      return;
    }

    const down = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "row.moveAdjacent", rowId: rowB.rowId, direction: "down" }
    );
    const moveDown = down.effects.find(
      (effect) => effect.type === "move" && effect.rowId === rowB.rowId
    );
    expect(moveDown?.type).toBe("move");
    if (moveDown?.type === "move") {
      expect(moveDown.position.anchorRowId).toBe(rowC.rowId);
      expect(moveDown.position.edge).toBe("after");
    }

    const up = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "row.moveAdjacent", rowId: rowB.rowId, direction: "up" }
    );
    const moveUp = up.effects.find(
      (effect) => effect.type === "move" && effect.rowId === rowB.rowId
    );
    expect(moveUp?.type).toBe("move");
    if (moveUp?.type === "move") {
      expect(moveUp.position.anchorRowId).toBe(rows[0]?.rowId);
      expect(moveUp.position.edge).toBe("before");
    }
  });

  it("row.focusAdjacent moves between list items and skips the list container", () => {
    const blocks: Block[] = [
      { id: "before", type: "text", props: { text: "Before" } },
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "One" },
      },
      {
        id: "item-2",
        type: "text",
        parentId: "list-1",
        props: { text: "Two" },
      },
      { id: "after", type: "text", props: { text: "After" } },
    ];
    const rows = buildBlockTree(blocks);
    const itemOne = rows[1]?.children[0];
    const itemTwo = rows[1]?.children[1];
    expect(itemOne).toBeDefined();
    expect(itemTwo).toBeDefined();
    if (!(itemOne && itemTwo)) {
      return;
    }

    const down = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "row.focusAdjacent", rowId: itemOne.rowId, direction: "down" }
    );
    const downFocus = down.effects.find((e) => e.type === "focus");
    expect(downFocus?.type).toBe("focus");
    if (downFocus?.type === "focus") {
      expect(downFocus.rowId).toBe(itemTwo.rowId);
      expect(downFocus.placement).toBe("start");
    }

    const upFromFirst = canvasReducer(
      { rows, serverBlocks: blocks },
      { type: "row.focusAdjacent", rowId: itemOne.rowId, direction: "up" }
    );
    const upFocus = upFromFirst.effects.find((e) => e.type === "focus");
    expect(upFocus?.type).toBe("focus");
    if (upFocus?.type === "focus") {
      expect(upFocus.rowId).toBe(rows[0]?.rowId);
      expect(upFocus.placement).toBe("end");
    }
  });

  it("row.convert on middle list item lifts out and splits the list", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-a",
        type: "text",
        parentId: "list-1",
        props: { text: "A" },
      },
      {
        id: "item-b",
        type: "text",
        parentId: "list-1",
        props: { text: "B" },
      },
      {
        id: "item-c",
        type: "text",
        parentId: "list-1",
        props: { text: "C" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemB = rows[0]?.children[1];
    expect(itemB).toBeDefined();
    if (!itemB) {
      return;
    }

    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      {
        type: "row.convert",
        rowId: itemB.rowId,
        to: "heading",
        options: { text: "B", headingLevel: 2 },
      }
    );

    expect(
      result.effects.some((e) => e.type === "delete" && e.rowId === "item-b")
    ).toBe(false);
    const convertedPersist = result.effects.find(
      (e) => e.type === "persist" && e.rowId === "item-b"
    );
    expect(convertedPersist?.type).toBe("persist");
    if (convertedPersist?.type === "persist") {
      expect(convertedPersist.block).toMatchObject({
        type: "heading",
        parentId: null,
        props: { level: 2, text: "B" },
      });
    }
    expect(
      result.effects.some((e) => e.type === "move" && e.rowId === "item-b")
    ).toBe(true);
    const tailListInsert = result.effects.find(
      (e) =>
        e.type === "insert" &&
        e.block.type === "list" &&
        e.block.id !== "list-1"
    );
    expect(tailListInsert?.type).toBe("insert");
    const reparentC = result.effects.find(
      (e) => e.type === "persist" && e.rowId === "item-c"
    );
    expect(reparentC?.type).toBe("persist");
    if (reparentC?.type === "persist") {
      expect(reparentC.block.parentId).not.toBe("list-1");
    }
  });

  it("row.convert on only list item replaces list with converted block", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "Only" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemRow = rows[0]?.children[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) {
      return;
    }

    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      {
        type: "row.convert",
        rowId: itemRow.rowId,
        to: "heading",
        options: { text: "Only", headingLevel: 1 },
      }
    );

    expect(
      result.effects.some((e) => e.type === "delete" && e.rowId === "list-1")
    ).toBe(true);
    const persist = result.effects.find(
      (e) => e.type === "persist" && e.rowId === "item-1"
    );
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.block).toMatchObject({
        type: "heading",
        parentId: null,
        props: { level: 1, text: "Only" },
      });
    }
    expect(
      result.effects.some((e) => e.type === "move" && e.rowId === "item-1")
    ).toBe(true);
  });

  it("row.convert text to text stays inside list", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "Hello" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemRow = rows[0]?.children[0];
    expect(itemRow).toBeDefined();
    if (!itemRow) {
      return;
    }

    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      {
        type: "row.convert",
        rowId: itemRow.rowId,
        to: "text",
        options: { text: "Updated" },
      }
    );

    expect(result.effects.some((e) => e.type === "delete")).toBe(false);
    const persist = result.effects.find((e) => e.type === "persist");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.block).toMatchObject({
        type: "text",
        parentId: "list-1",
        props: { text: "Updated" },
      });
    }
  });

  it("container.wrap on list item lifts out before wrapping", () => {
    const listBlocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "bullet" } },
      {
        id: "item-a",
        type: "text",
        parentId: "list-1",
        props: { text: "A" },
      },
      {
        id: "item-b",
        type: "text",
        parentId: "list-1",
        props: { text: "Wrap me" },
      },
    ];
    const rows = buildBlockTree(listBlocks);
    const itemB = rows[0]?.children[1];
    expect(itemB).toBeDefined();
    if (!itemB) {
      return;
    }

    const result = canvasReducer(
      { rows, serverBlocks: listBlocks },
      {
        type: "container.wrap",
        rowId: itemB.rowId,
        containerType: "list",
        variant: "ordered",
        childText: "Wrap me",
      }
    );

    const wrapPersist = result.effects.find(
      (e) =>
        e.type === "persist" && e.rowId === "item-b" && e.block.type === "list"
    );
    expect(wrapPersist?.type).toBe("persist");
    if (wrapPersist?.type === "persist") {
      expect(wrapPersist.block.props).toEqual({ variant: "ordered" });
    }
    const childInsert = result.effects.find(
      (e) =>
        e.type === "insert" &&
        e.block.type === "text" &&
        e.block.parentId === "item-b"
    );
    expect(childInsert?.type).toBe("insert");
  });

  it("container.wrap keeps block id when converting trailing blank to list", () => {
    const rows = buildBlockTree([
      { id: "trailing-blank", type: "text", props: { text: "" } },
    ]);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const result = canvasReducer(
      { rows, serverBlocks: rows.map((r) => r.effectiveBlock) },
      {
        type: "container.wrap",
        rowId: row.rowId,
        containerType: "list",
        variant: "bullet",
        childText: "",
      }
    );
    const persist = result.effects.find((e) => e.type === "persist");
    const insert = result.effects.find((e) => e.type === "insert");
    expect(persist?.type).toBe("persist");
    if (persist?.type === "persist") {
      expect(persist.rowId).toBe("trailing-blank");
      expect(persist.block.type).toBe("list");
      expect(persist.block.id).toBe("trailing-blank");
    }
    expect(insert?.type).toBe("insert");
    if (insert?.type === "insert") {
      expect(insert.block.parentId).toBe("trailing-blank");
      expect(insert.position.parentId).toBe("trailing-blank");
    }
  });
});
