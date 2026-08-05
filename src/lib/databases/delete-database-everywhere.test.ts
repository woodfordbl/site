import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";

const mocks = vi.hoisted(() => ({
  deleteDatabase: vi.fn(),
  deleteDatabaseBlockReferences: vi.fn(() => Promise.resolve()),
  reportPersistenceError: vi.fn(),
}));

vi.mock("@/db/persistence-errors.ts", () => ({
  reportPersistenceError: mocks.reportPersistenceError,
}));

vi.mock("@/db/queries/database-collection-ops.ts", () => ({
  deleteDatabase: mocks.deleteDatabase,
}));

vi.mock("@/lib/databases/delete-database-block-references.ts", () => ({
  deleteDatabaseBlockReferences: mocks.deleteDatabaseBlockReferences,
}));

import { deleteDatabasesEverywhere } from "@/lib/databases/delete-database-everywhere.ts";

function page(id: string, parentId: string | null = null): PageSummary {
  return { id, title: id, slug: `/${id}`, parentId, routeBy: "slug" };
}

const HOST = page("host");
const HUB: PageSummary = {
  ...page("hub", "host"),
  databaseSource: { databaseId: "db-1" },
};
const ROW_PAGE: PageSummary = {
  ...page("row", "hub"),
  databaseRowSource: { databaseId: "db-1", rowId: "r1" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteDatabasesEverywhere", () => {
  it("deletes the hub page, the definition, and every linked block", () => {
    const dispatchPage = vi.fn();
    const pages = [HOST, HUB, ROW_PAGE];

    deleteDatabasesEverywhere({
      databaseIds: ["db-1"],
      dispatchPage,
      pages,
    });

    expect(dispatchPage).toHaveBeenCalledExactlyOnceWith({
      type: "page.delete",
      pageId: "hub",
    });
    expect(mocks.deleteDatabase).toHaveBeenCalledExactlyOnceWith("db-1");
    expect(mocks.deleteDatabaseBlockReferences).toHaveBeenCalledExactlyOnceWith(
      "db-1",
      pages
    );
  });

  it("skips page deletion when the database has no hub page yet", () => {
    const dispatchPage = vi.fn();

    deleteDatabasesEverywhere({
      databaseIds: ["db-1"],
      dispatchPage,
      pages: [HOST],
    });

    expect(dispatchPage).not.toHaveBeenCalled();
    expect(mocks.deleteDatabase).toHaveBeenCalledExactlyOnceWith("db-1");
  });

  it("cascades each database when a selection spans several", () => {
    const dispatchPage = vi.fn();

    deleteDatabasesEverywhere({
      databaseIds: ["db-1", "db-2"],
      dispatchPage,
      pages: [HOST, HUB],
    });

    expect(mocks.deleteDatabase.mock.calls).toEqual([["db-1"], ["db-2"]]);
    expect(dispatchPage).toHaveBeenCalledExactlyOnceWith({
      type: "page.delete",
      pageId: "hub",
    });
  });

  it("reports a failed block cascade instead of rejecting into the caller", async () => {
    const failure = new Error("shard unavailable");
    mocks.deleteDatabaseBlockReferences.mockReturnValueOnce(
      Promise.reject(failure)
    );

    expect(() =>
      deleteDatabasesEverywhere({
        databaseIds: ["db-1"],
        dispatchPage: vi.fn(),
        pages: [HOST],
      })
    ).not.toThrow();

    await vi.waitFor(() =>
      expect(mocks.reportPersistenceError).toHaveBeenCalledWith(failure)
    );
    expect(mocks.deleteDatabase).toHaveBeenCalledExactlyOnceWith("db-1");
  });
});
