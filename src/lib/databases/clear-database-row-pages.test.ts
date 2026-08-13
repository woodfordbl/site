import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import type { LocalDatabaseRow } from "@/lib/schemas/database.ts";

const mocks = vi.hoisted(() => ({
  clearDatabaseRowPageLink: vi.fn(),
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
  clearDatabaseRowPageLink: mocks.clearDatabaseRowPageLink,
  clearDatabaseRowPageLinks: mocks.clearDatabaseRowPageLinks,
}));

import {
  clearDatabaseRowPage,
  clearDatabaseRowPages,
  isDatabaseRowPageMaterialized,
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

describe("isDatabaseRowPageMaterialized", () => {
  it("accepts either the row link or the page source marker", () => {
    expect(isDatabaseRowPageMaterialized(row("r1", "db-1", "page-1"), [])).toBe(
      true
    );
    expect(
      isDatabaseRowPageMaterialized(row("r1", "db-1"), [
        page("page-1", { databaseId: "db-1", rowId: "r1" }),
      ])
    ).toBe(true);
    expect(isDatabaseRowPageMaterialized(row("r1", "db-1"), [])).toBe(false);
  });
});

describe("clearDatabaseRowPage", () => {
  it("deletes only the selected row page and clears only its link", () => {
    const dispatchPage = vi.fn();
    const target = row("r1", "db-1", "page-1");

    expect(
      clearDatabaseRowPage({
        dispatchPage,
        pages: [
          page("page-1", { databaseId: "db-1", rowId: "r1" }),
          page("page-2", { databaseId: "db-1", rowId: "r2" }),
        ],
        row: target,
      })
    ).toBe(true);

    expect(dispatchPage).toHaveBeenCalledWith({
      type: "page.delete",
      pageId: "page-1",
    });
    expect(dispatchPage).toHaveBeenCalledTimes(1);
    expect(mocks.clearDatabaseRowPageLink).toHaveBeenCalledWith("r1");
    expect(mocks.clearDatabaseRowPageLinks).not.toHaveBeenCalled();
  });

  it("recovers a page id from its source marker when the row link is missing", () => {
    const dispatchPage = vi.fn();

    expect(
      clearDatabaseRowPage({
        dispatchPage,
        pages: [page("page-1", { databaseId: "db-1", rowId: "r1" })],
        row: row("r1", "db-1"),
      })
    ).toBe(true);

    expect(dispatchPage).toHaveBeenCalledWith({
      type: "page.delete",
      pageId: "page-1",
    });
    expect(mocks.clearDatabaseRowPageLink).toHaveBeenCalledWith("r1");
  });

  it("does nothing when the row has no separate content", () => {
    const dispatchPage = vi.fn();

    expect(
      clearDatabaseRowPage({
        dispatchPage,
        pages: [],
        row: row("r1", "db-1"),
      })
    ).toBe(false);

    expect(dispatchPage).not.toHaveBeenCalled();
    expect(mocks.clearDatabaseRowPageLink).not.toHaveBeenCalled();
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
