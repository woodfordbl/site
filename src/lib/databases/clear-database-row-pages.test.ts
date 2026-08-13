import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

const mocks = vi.hoisted(() => ({
  clearDatabaseRowPageLinks: vi.fn(),
  rowState: [] as LocalDatabaseRow[],
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localDatabaseRowsCollection: {
    get toArray() {
      return mocks.rowState;
    },
  },
}));

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  clearDatabaseRowPageLinks: mocks.clearDatabaseRowPageLinks,
}));

import {
  clearDatabaseRowPages,
  listMaterializedDatabaseRowPageIds,
} from "@/lib/databases/clear-database-row-pages.ts";

function page(
  id: string,
  databaseRowSource?: PageSummary["databaseRowSource"]
): PageSummary {
  return {
    id,
    title: id,
    slug: `/${id}`,
    parentId: null,
    routeBy: "slug",
    databaseRowSource,
  };
}

function row(
  id: string,
  databaseId: string,
  pageId?: string | null
): LocalDatabaseRow {
  return {
    id,
    databaseId,
    values: {},
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    pageId: pageId ?? undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rowState = [];
});

describe("listMaterializedDatabaseRowPageIds", () => {
  it("collects pages marked with databaseRowSource", () => {
    const pages = [
      page("home"),
      page("row-a", { databaseId: "db-1", rowId: "r1" }),
      page("row-b", { databaseId: "db-2", rowId: "r2" }),
    ];

    expect(listMaterializedDatabaseRowPageIds("db-1", pages)).toEqual([
      "row-a",
    ]);
  });

  it("includes dangling row.pageId links not present in pages", () => {
    mocks.rowState = [row("r1", "db-1", "missing-page")];

    expect(listMaterializedDatabaseRowPageIds("db-1", [])).toEqual([
      "missing-page",
    ]);
  });
});

describe("clearDatabaseRowPages", () => {
  it("deletes each materialized page and clears row links", () => {
    const dispatchPage = vi.fn();
    const pages = [
      page("row-a", { databaseId: "db-1", rowId: "r1" }),
      page("row-b", { databaseId: "db-1", rowId: "r2" }),
      page("other", { databaseId: "db-2", rowId: "r3" }),
    ];

    const cleared = clearDatabaseRowPages({
      databaseId: "db-1",
      dispatchPage,
      pages,
    });

    expect(cleared).toBe(2);
    expect(dispatchPage).toHaveBeenCalledWith({
      type: "page.delete",
      pageId: "row-a",
    });
    expect(dispatchPage).toHaveBeenCalledWith({
      type: "page.delete",
      pageId: "row-b",
    });
    expect(dispatchPage).toHaveBeenCalledTimes(2);
    expect(mocks.clearDatabaseRowPageLinks).toHaveBeenCalledWith("db-1");
  });

  it("is a no-op delete when nothing is materialized", () => {
    const dispatchPage = vi.fn();

    expect(
      clearDatabaseRowPages({
        databaseId: "db-1",
        dispatchPage,
        pages: [page("home")],
      })
    ).toBe(0);

    expect(dispatchPage).not.toHaveBeenCalled();
    expect(mocks.clearDatabaseRowPageLinks).toHaveBeenCalledWith("db-1");
  });
});
