import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { resolveStructuralAction } from "@/lib/canvas/resolve-structural-action.ts";
import { buildStructuralContext } from "@/lib/canvas/structural-context.ts";
import type { Block } from "@/lib/schemas/block.ts";

describe("resolveStructuralAction", () => {
  const serverBlocks: Block[] = [
    { id: "p1", type: "text", props: { text: "First" } },
    { id: "p2", type: "text", props: { text: "" } },
  ];

  it("deletes empty canvas row and focuses previous", () => {
    const rows = buildBlockTree(serverBlocks);
    const emptyRow = rows[1];
    expect(emptyRow).toBeDefined();
    if (!emptyRow) {
      return;
    }
    const ctx = buildStructuralContext(rows, emptyRow.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }
    const firstRow = rows[0];
    expect(firstRow).toBeDefined();
    if (!firstRow) {
      return;
    }
    expect(resolveStructuralAction(ctx)).toEqual([
      { type: "row.delete", rowId: emptyRow.rowId },
      {
        type: "focus.set",
        rowId: firstRow.rowId,
        placement: "end",
      },
    ]);
  });

  it("does not delete the sole empty top-level row", () => {
    const sole: Block[] = [{ id: "p1", type: "text", props: { text: "" } }];
    const rows = buildBlockTree(sole);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const ctx = buildStructuralContext(rows, row.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }
    expect(resolveStructuralAction(ctx)).toEqual([]);
  });

  it("lifts empty first list item to text instead of deleting", () => {
    const blocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "ordered" } },
      { id: "item-1", type: "text", parentId: "list-1", props: { text: "" } },
      {
        id: "item-2",
        type: "text",
        parentId: "list-1",
        props: { text: "Second" },
      },
    ];
    const rows = buildBlockTree(blocks);
    const emptyFirstItem = rows[0]?.children[0];
    expect(emptyFirstItem).toBeDefined();
    if (!emptyFirstItem) {
      return;
    }
    const ctx = buildStructuralContext(rows, emptyFirstItem.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }
    expect(resolveStructuralAction(ctx)).toEqual([
      { type: "block.liftAsText", rowId: emptyFirstItem.rowId },
    ]);
  });

  it("deletes empty list item with previous sibling and focuses previous", () => {
    const blocks: Block[] = [
      { id: "list-1", type: "list", props: { variant: "ordered" } },
      {
        id: "item-1",
        type: "text",
        parentId: "list-1",
        props: { text: "First" },
      },
      { id: "item-2", type: "text", parentId: "list-1", props: { text: "" } },
    ];
    const rows = buildBlockTree(blocks);
    const emptySecondItem = rows[0]?.children[1];
    const firstItem = rows[0]?.children[0];
    expect(emptySecondItem).toBeDefined();
    expect(firstItem).toBeDefined();
    if (!(emptySecondItem && firstItem)) {
      return;
    }
    const ctx = buildStructuralContext(rows, emptySecondItem.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }
    expect(resolveStructuralAction(ctx)).toEqual([
      { type: "row.delete", rowId: emptySecondItem.rowId },
      {
        type: "focus.set",
        rowId: firstItem.rowId,
        placement: "end",
      },
    ]);
  });

  it("outdents empty indented block", () => {
    const indented: Block[] = [
      { id: "p1", type: "text", indent: 2, props: { text: "" } },
    ];
    const rows = buildBlockTree(indented);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) {
      return;
    }
    const ctx = buildStructuralContext(rows, row.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }
    const commands = resolveStructuralAction(ctx);
    expect(commands).toEqual([
      { type: "indent.adjust", rowId: row.rowId, delta: -1 },
    ]);
  });
});
