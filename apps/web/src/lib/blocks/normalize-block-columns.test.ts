import { describe, expect, it } from "vitest";
import { createEmptyBlock } from "@/lib/blocks/create-block.ts";
import {
  coerceContainerChildBlocks,
  ensureColumnMinimumChildren,
} from "@/lib/blocks/normalize-block.ts";

describe("columns normalize", () => {
  it("coerces non-column children of columns to column type", () => {
    const columns = createEmptyBlock("columns");
    columns.id = "cols";
    const wrongChild = createEmptyBlock("text");
    wrongChild.id = "bad";
    wrongChild.parentId = "cols";

    const result = coerceContainerChildBlocks([columns, wrongChild]);
    const child = result.find((b) => b.id === "bad");
    expect(child?.type).toBe("column");
  });

  it("seeds empty text when column has no children", () => {
    const columns = createEmptyBlock("columns");
    columns.id = "cols";
    const column = createEmptyBlock("column");
    column.id = "col";
    column.parentId = "cols";

    const result = ensureColumnMinimumChildren([columns, column]);
    const seeded = result.find((b) => b.parentId === "col");
    expect(seeded?.type).toBe("text");
  });
});
