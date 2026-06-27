import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import { resolveStructuralAction } from "@/lib/canvas/resolve-structural-action.ts";
import { buildStructuralContext } from "@/lib/canvas/structural-context.ts";
import {
  buildBlocksForTabsCreate,
  buildTabBlock,
  planTabsAddTab,
  planTabsCreate,
  planTabsRemoveTab,
} from "@/lib/canvas/tabs-layout.ts";
import type { Block } from "@/lib/schemas/block.ts";

function textBlock(id: string, parentId: string | null, text = ""): Block {
  return {
    ...createEmptyBlock("text"),
    id,
    parentId,
    props: { text },
  };
}

function buildTwoTabBlocks(labelA = "Tab 1", labelB = "Tab 2"): Block[] {
  const tabs = createEmptyBlock("tabs");
  tabs.id = "tabs";
  const tabA = buildTabBlock("tabs", labelA);
  tabA.id = "tab-a";
  const tabB = buildTabBlock("tabs", labelB);
  tabB.id = "tab-b";
  return [
    tabs,
    tabA,
    tabB,
    textBlock("text-a", "tab-a", "hello"),
    textBlock("text-b", "tab-b", "world"),
  ];
}

describe("planTabsCreate", () => {
  it("creates N tabs each with a text child and Tab N labels", () => {
    const text = textBlock("row-1", null, "hello");
    const rows = buildBlockTree([text]);
    const effects = planTabsCreate(rows, "row-1", 3);

    const tabInserts = effects.filter(
      (e) => e.type === "insert" && e.block.type === "tab"
    );
    const textInserts = effects.filter(
      (e) => e.type === "insert" && e.block.type === "text"
    );
    expect(tabInserts).toHaveLength(3);
    expect(textInserts).toHaveLength(3);

    const labels = tabInserts.map((e) =>
      e.type === "insert" && e.block.type === "tab" ? e.block.props.label : ""
    );
    expect(labels).toEqual(["Tab 1", "Tab 2", "Tab 3"]);
  });
});

describe("canvasReducer tabs.create", () => {
  it("emits a single tabs.apply effect with tab children", () => {
    const text = textBlock("row-1", null);
    const rows = buildBlockTree([text]);
    const { effects } = canvasReducer(
      { rows },
      { type: "tabs.create", rowId: "row-1", count: 2 }
    );

    expect(effects).toHaveLength(1);
    const apply = effects[0];
    expect(apply?.type).toBe("tabs.apply");
    if (apply?.type !== "tabs.apply") {
      return;
    }

    const tabBlocks = apply.blocks.filter((block) => block.type === "tab");
    const tree = buildBlockTree(apply.blocks);
    const firstTabTextRowId = tree[0]?.children[0]?.children[0]?.rowId;

    expect(tabBlocks).toHaveLength(2);
    expect(apply.focusRowId).toBe(firstTabTextRowId);
  });
});

describe("buildBlocksForTabsCreate", () => {
  it("builds a tabs shell with a text row in each tab", () => {
    const text = textBlock("row-1", null, "seed");
    const rows = buildBlockTree([text]);
    const { blocks, focusRowId } = buildBlocksForTabsCreate(
      [text],
      rows,
      "row-1",
      2,
      ""
    );
    const tree = buildBlockTree(blocks);

    expect(tree[0]?.effectiveBlock.type).toBe("tabs");
    expect(tree[0]?.children).toHaveLength(2);
    expect(focusRowId).toBe(tree[0]?.children[0]?.children[0]?.rowId);
  });
});

describe("planTabsAddTab", () => {
  it("appends a labelled tab with a text child", () => {
    const blocks = buildTwoTabBlocks();
    const rows = buildBlockTree(blocks);
    const effects = planTabsAddTab(rows, "tabs");

    const tabInsert = effects.find(
      (e) => e.type === "insert" && e.block.type === "tab"
    );
    expect(tabInsert?.type).toBe("insert");
    if (tabInsert?.type !== "insert" || tabInsert.block.type !== "tab") {
      return;
    }
    expect(tabInsert.block.props.label).toBe("Tab 3");
    expect(
      effects.some((e) => e.type === "insert" && e.block.type === "text")
    ).toBe(true);
  });
});

describe("planTabsRemoveTab", () => {
  it("deletes the tab and focuses an adjacent tab when above the minimum", () => {
    const tabs = createEmptyBlock("tabs");
    tabs.id = "tabs";
    const ids = ["tab-a", "tab-b", "tab-c"];
    const blocks: Block[] = [tabs];
    for (const [index, id] of ids.entries()) {
      const tab = buildTabBlock("tabs", `Tab ${index + 1}`);
      tab.id = id;
      blocks.push(tab, textBlock(`text-${id}`, id, ""));
    }
    const rows = buildBlockTree(blocks);
    const effects = planTabsRemoveTab(rows, "tab-b");

    expect(
      effects.some((e) => e.type === "delete" && e.rowId === "tab-b")
    ).toBe(true);
    // No unwrap: the tabs container survives (no delete of the shell).
    expect(effects.some((e) => e.type === "delete" && e.rowId === "tabs")).toBe(
      false
    );
  });

  it("deletes a tab without unwrapping while one tab still remains", () => {
    const blocks = buildTwoTabBlocks();
    const rows = buildBlockTree(blocks);
    const effects = planTabsRemoveTab(rows, "tab-a");

    expect(
      effects.some((e) => e.type === "delete" && e.rowId === "tab-a")
    ).toBe(true);
    // The container survives since a single tab is allowed (MIN_TABS_COUNT = 1).
    expect(effects.some((e) => e.type === "delete" && e.rowId === "tabs")).toBe(
      false
    );
  });

  it("dissolves the block when removing the last remaining tab", () => {
    const tabs = createEmptyBlock("tabs");
    tabs.id = "tabs";
    const tab = buildTabBlock("tabs", "Tab 1");
    tab.id = "tab-a";
    const blocks: Block[] = [tabs, tab, textBlock("text-a", "tab-a", "")];
    const rows = buildBlockTree(blocks);
    const effects = planTabsRemoveTab(rows, "tab-a");

    expect(effects.some((e) => e.type === "delete" && e.rowId === "tabs")).toBe(
      true
    );
    expect(
      effects.some((e) => e.type === "delete" && e.rowId === "tab-a")
    ).toBe(true);
  });
});

describe("tab empty delete", () => {
  it("removes the tab when deleting its only block", () => {
    const blocks = buildTwoTabBlocks("Tab 1", "Tab 2");
    blocks[3] = textBlock("text-a", "tab-a", "");
    const rows = buildBlockTree(blocks);
    const textRow = rows[0]?.children[0]?.children[0];
    expect(textRow).toBeDefined();
    if (!textRow) {
      return;
    }

    const ctx = buildStructuralContext(rows, textRow.rowId, {
      caretAtStart: true,
      key: "Backspace",
    });
    expect(ctx).not.toBeNull();
    if (!ctx) {
      return;
    }

    const commands = resolveStructuralAction(ctx);
    expect(commands).toEqual([{ type: "tabs.removeTab", tabRowId: "tab-a" }]);
  });
});

describe("tab row.split", () => {
  it("inserts a text sibling inside the same tab", () => {
    const blocks = buildTwoTabBlocks();
    const rows = buildBlockTree(blocks);
    const { effects } = canvasReducer(
      { rows },
      { type: "row.split", rowId: "text-a", start: 5, end: 5 }
    );
    const insert = effects.find((effect) => effect.type === "insert");
    expect(insert?.type).toBe("insert");
    if (insert?.type !== "insert") {
      return;
    }
    expect(insert.block.type).toBe("text");
    expect(insert.block.parentId).toBe("tab-a");
    expect(insert.position.parentId).toBe("tab-a");
  });
});
