import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { resolveDuplicateRowId } from "@/lib/canvas/duplicate-row-target.ts";
import type { Block } from "@/lib/schemas/block.ts";

function textBlock(id: string, parentId?: string): Block {
  return {
    id,
    type: "text",
    parentId: parentId ?? null,
    props: { text: "" },
  };
}

describe("resolveDuplicateRowId", () => {
  it("duplicates the last selected row in document order", () => {
    const rows = buildBlockTree([
      textBlock("a"),
      textBlock("b"),
      textBlock("c"),
    ]);

    expect(
      resolveDuplicateRowId(rows, { selectedRowIds: ["c", "a"], rowId: null })
    ).toBe("c");
  });

  it("maps a focused table cell to its parent row", () => {
    const rows = buildBlockTree([
      {
        id: "table",
        type: "table",
        parentId: null,
        props: {
          columnWidths: [1, 1, 1],
          hasHeaderRow: false,
          hasHeaderColumn: false,
        },
      },
      {
        id: "row",
        type: "tableRow",
        parentId: "table",
        props: {},
      },
      {
        id: "cell",
        type: "tableCell",
        parentId: "row",
        props: { text: "" },
      },
    ]);

    expect(
      resolveDuplicateRowId(rows, { selectedRowIds: [], rowId: "cell" })
    ).toBe("row");
  });
});
