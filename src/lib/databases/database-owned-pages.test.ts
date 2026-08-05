import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { resolveDatabaseOwnedPageDeleteRoots } from "@/lib/databases/database-owned-pages.ts";

function page(id: string, parentId: string | null = null): PageSummary {
  return { id, title: id, slug: `/${id}`, parentId, routeBy: "slug" };
}

function hub(
  id: string,
  databaseId: string,
  parentId: string | null
): PageSummary {
  return { ...page(id, parentId), databaseSource: { databaseId } };
}

function rowPage(
  id: string,
  databaseId: string,
  parentId: string | null
): PageSummary {
  return {
    ...page(id, parentId),
    databaseRowSource: { databaseId, rowId: `${id}-row` },
  };
}

describe("resolveDatabaseOwnedPageDeleteRoots", () => {
  it("returns nothing when the database owns no pages", () => {
    expect(resolveDatabaseOwnedPageDeleteRoots("db-1", [page("home")])).toEqual(
      []
    );
  });

  it("returns the hub page and drops its row-page descendants", () => {
    const pages = [
      page("host"),
      hub("hub", "db-1", "host"),
      rowPage("row-a", "db-1", "hub"),
      rowPage("row-b", "db-1", "hub"),
    ];

    expect(resolveDatabaseOwnedPageDeleteRoots("db-1", pages)).toEqual(["hub"]);
  });

  it("drops row pages nested deeper under the hub", () => {
    const pages = [
      hub("hub", "db-1", null),
      rowPage("row-a", "db-1", "hub"),
      rowPage("row-b", "db-1", "row-a"),
    ];

    expect(resolveDatabaseOwnedPageDeleteRoots("db-1", pages)).toEqual(["hub"]);
  });

  it("keeps owned pages that sit outside the hub subtree", () => {
    const pages = [
      page("host"),
      hub("hub", "db-1", "host"),
      rowPage("stray", "db-1", "host"),
    ];

    expect(resolveDatabaseOwnedPageDeleteRoots("db-1", pages).sort()).toEqual([
      "hub",
      "stray",
    ]);
  });

  it("ignores pages owned by a different database", () => {
    const pages = [hub("hub-1", "db-1", null), hub("hub-2", "db-2", null)];

    expect(resolveDatabaseOwnedPageDeleteRoots("db-1", pages)).toEqual([
      "hub-1",
    ]);
  });

  it("survives a parent cycle without looping forever", () => {
    const pages = [
      { ...hub("a", "db-1", "b") },
      { ...rowPage("b", "db-1", "a") },
    ];

    expect(resolveDatabaseOwnedPageDeleteRoots("db-1", pages)).toEqual([]);
  });
});
