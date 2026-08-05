import { describe, expect, it } from "vitest";

import { buildBlockTree } from "@/lib/blocks/block-tree.ts";
import { resolveDeletedDatabaseIds } from "@/lib/databases/resolve-database-block-deletion.ts";
import type { Block } from "@/lib/schemas/block.ts";

function text(id: string, parentId?: string): Block {
  return {
    id,
    type: "text",
    props: { text: id },
    ...(parentId ? { parentId } : {}),
  };
}

function databaseBlock(
  id: string,
  databaseId: string,
  parentId?: string
): Block {
  return {
    id,
    type: "database",
    props: { databaseId },
    ...(parentId ? { parentId } : {}),
  };
}

describe("resolveDeletedDatabaseIds", () => {
  it("returns the database behind a linked database row", () => {
    const rows = buildBlockTree([text("t1"), databaseBlock("b1", "db-1")]);

    expect(resolveDeletedDatabaseIds(rows, ["b1"])).toEqual(["db-1"]);
  });

  it("ignores rows that are not database blocks", () => {
    const rows = buildBlockTree([text("t1"), databaseBlock("b1", "db-1")]);

    expect(resolveDeletedDatabaseIds(rows, ["t1"])).toEqual([]);
  });

  it("ignores unlinked database blocks", () => {
    const rows = buildBlockTree([databaseBlock("b1", "")]);

    expect(resolveDeletedDatabaseIds(rows, ["b1"])).toEqual([]);
  });

  it("finds database blocks nested inside a deleted container", () => {
    const rows = buildBlockTree([
      { id: "cols", type: "columns", props: {} },
      { id: "col-1", type: "column", props: {}, parentId: "cols" },
      databaseBlock("b1", "db-1", "col-1"),
      { id: "col-2", type: "column", props: {}, parentId: "cols" },
      text("t1", "col-2"),
    ]);

    expect(resolveDeletedDatabaseIds(rows, ["cols"])).toEqual(["db-1"]);
  });

  it("dedupes linked views of the same database in one selection", () => {
    const rows = buildBlockTree([
      databaseBlock("b1", "db-1"),
      databaseBlock("b2", "db-1"),
      databaseBlock("b3", "db-2"),
    ]);

    expect(resolveDeletedDatabaseIds(rows, ["b1", "b2", "b3"])).toEqual([
      "db-1",
      "db-2",
    ]);
  });

  it("skips row ids that are no longer on the canvas", () => {
    const rows = buildBlockTree([databaseBlock("b1", "db-1")]);

    expect(resolveDeletedDatabaseIds(rows, ["missing"])).toEqual([]);
  });
});
