import {
  IconChevronRight,
  IconLayoutColumns,
  IconLayoutNavbar,
  IconTable,
} from "@tabler/icons-react";
import { describe, expect, it, vi } from "vitest";
import type { CanvasRow } from "@/lib/blocks/block-tree.ts";
import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import { applyBlockConversion } from "@/lib/canvas/apply-block-conversion.ts";
import { applyCanvasEffects } from "@/lib/canvas/apply-effects.ts";
import { canvasReducer } from "@/lib/canvas/reducer.ts";
import type { Block } from "@/lib/schemas/block.ts";

function textBlock(id: string, parentId: string | null, text = ""): Block {
  return {
    ...createEmptyBlock("text"),
    id,
    parentId,
    props: { text },
  };
}

describe("applyBlockConversion columns", () => {
  it("dispatches columns.create with columnCount from slash menu item", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null, "/3"),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "columns-3",
        id: "columns",
        columnCount: 3,
        label: "3 columns",
        aliases: ["3"],
        icon: IconLayoutColumns,
        keywords: ["3 columns"],
      },
      (command) => {
        commands.push(command);
      }
    );

    expect(commands).toEqual([
      {
        type: "columns.create",
        rowId: "row-1",
        count: 3,
        text: "",
      },
    ]);
  });

  it("defaults to 2 columns when columnCount is missing", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "columns",
        id: "columns",
        label: "Columns",
        aliases: [],
        icon: IconLayoutColumns,
        keywords: ["columns"],
      },
      (command) => {
        commands.push(command);
      }
    );

    expect(commands).toEqual([
      {
        type: "columns.create",
        rowId: "row-1",
        count: 2,
        text: "",
      },
    ]);
  });
});

describe("applyBlockConversion tabs", () => {
  it("dispatches tabs.create with tabCount from the slash menu item", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null, "/tabs"),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "tabs-2",
        id: "tabs",
        tabCount: 2,
        label: "Tabs",
        aliases: ["tabs"],
        icon: IconLayoutNavbar,
        keywords: ["tabs"],
      },
      (command) => {
        commands.push(command);
      }
    );

    expect(commands).toEqual([
      {
        type: "tabs.create",
        rowId: "row-1",
        count: 2,
        text: "",
      },
    ]);
  });

  it("defaults to 2 tabs when tabCount is missing", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "tabs",
        id: "tabs",
        label: "Tabs",
        aliases: [],
        icon: IconLayoutNavbar,
        keywords: ["tabs"],
      },
      (command) => {
        commands.push(command);
      }
    );

    expect(commands).toEqual([
      {
        type: "tabs.create",
        rowId: "row-1",
        count: 2,
        text: "",
      },
    ]);
  });
});

describe("applyBlockConversion toggle heading", () => {
  it("dispatches toggleHeading.create with the slash item's level, no absorb", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null, "/toggle"),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "toggleHeading-2",
        id: "toggleHeading",
        toggleHeadingLevel: 2,
        label: "Toggle heading 2",
        aliases: [],
        icon: IconChevronRight,
        keywords: ["toggle heading 2"],
      },
      (command) => {
        commands.push(command);
      }
    );

    expect(commands).toEqual([
      {
        type: "toggleHeading.create",
        rowId: "row-1",
        level: 2,
        text: "",
        absorb: false,
      },
    ]);
  });

  it("passes absorb through from the turn-into path", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null, "Section"),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "toggleHeading-1",
        id: "toggleHeading",
        toggleHeadingLevel: 1,
        label: "Toggle heading 1",
        aliases: [],
        icon: IconChevronRight,
        keywords: ["toggle heading 1"],
      },
      (command) => {
        commands.push(command);
      },
      { absorb: true }
    );

    expect(commands).toEqual([
      {
        type: "toggleHeading.create",
        rowId: "row-1",
        level: 1,
        text: "Section",
        absorb: true,
      },
    ]);
  });
});

describe("applyBlockConversion table", () => {
  it("dispatches table.create as a 3×3 grid from the Table slash item", () => {
    const row: CanvasRow = {
      rowId: "row-1",
      effectiveBlock: textBlock("row-1", null, "/table"),
      children: [],
    };

    const commands: unknown[] = [];
    applyBlockConversion(
      row,
      {
        key: "table",
        id: "table",
        label: "Table",
        aliases: ["table", "grid"],
        icon: IconTable,
        keywords: ["Table", "table", "grid"],
      },
      (command) => {
        commands.push(command);
      }
    );

    expect(commands).toEqual([
      {
        type: "table.create",
        rowId: "row-1",
        columns: 3,
        rows: 3,
        text: "",
      },
    ]);
  });
});

describe("applyCanvasEffects columns.create", () => {
  it("persists column children and focuses the first text row", () => {
    const blocks: Block[] = [textBlock("row-1", null, "hello")];
    const rows = buildBlockTree(blocks);
    const result = canvasReducer(
      { rows },
      { type: "columns.create", rowId: "row-1", count: 2, text: "" }
    );

    let workingBlocks = [...blocks];
    const setFocus = vi.fn();

    applyCanvasEffects(
      result.effects,
      {
        saveRow: vi.fn(),
        savePageBlocks: (nextBlocks) => {
          workingBlocks = nextBlocks;
        },
        deleteRow: vi.fn(),
        insertRow: vi.fn(),
        moveRow: vi.fn(),
        revertToServer: vi.fn(),
        acknowledgeServerBaseline: vi.fn(),
      },
      rows,
      setFocus
    );

    const tree = buildBlockTree(workingBlocks);
    const firstColumnTextRowId = tree[0]?.children[0]?.children[0]?.rowId;

    expect(tree).toHaveLength(1);
    expect(tree[0]?.effectiveBlock.type).toBe("columns");
    expect(tree[0]?.children).toHaveLength(2);
    expect(firstColumnTextRowId).toBeTruthy();
    expect(setFocus).toHaveBeenCalledWith({
      rowId: firstColumnTextRowId,
      placement: "start",
      offset: 0,
    });
  });
});

describe("applyCanvasEffects tabs.create", () => {
  it("persists tab children and focuses the first text row", () => {
    const blocks: Block[] = [textBlock("row-1", null, "hello")];
    const rows = buildBlockTree(blocks);
    const result = canvasReducer(
      { rows },
      { type: "tabs.create", rowId: "row-1", count: 2, text: "" }
    );

    let workingBlocks = [...blocks];
    const setFocus = vi.fn();

    applyCanvasEffects(
      result.effects,
      {
        saveRow: vi.fn(),
        savePageBlocks: (nextBlocks) => {
          workingBlocks = nextBlocks;
        },
        deleteRow: vi.fn(),
        insertRow: vi.fn(),
        moveRow: vi.fn(),
        revertToServer: vi.fn(),
        acknowledgeServerBaseline: vi.fn(),
      },
      rows,
      setFocus
    );

    const tree = buildBlockTree(workingBlocks);
    const firstTabTextRowId = tree[0]?.children[0]?.children[0]?.rowId;

    expect(tree).toHaveLength(1);
    expect(tree[0]?.effectiveBlock.type).toBe("tabs");
    expect(tree[0]?.children).toHaveLength(2);
    expect(firstTabTextRowId).toBeTruthy();
    expect(setFocus).toHaveBeenCalledWith({
      rowId: firstTabTextRowId,
      placement: "start",
      offset: 0,
    });
  });
});
