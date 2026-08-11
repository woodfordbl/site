import { describe, expect, it } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { canNestDatabaseUnder } from "@/lib/databases/can-nest-database-under.ts";
import {
  databaseListDragSourceId,
  parseDatabaseListDragSourceId,
} from "@/lib/databases/database-list-drag.ts";
import type { HostScanBlock } from "@/lib/databases/resolve-database-host-page.ts";

function page(id: string, options: Partial<PageSummary> = {}): PageSummary {
  return {
    id,
    title: id,
    slug: id === "home" ? "/" : `/${id}`,
    parentId: null,
    routeBy: "slug",
    ...options,
  };
}

function databaseBlock(pageId: string, databaseId: string): HostScanBlock {
  return { pageId, type: "database", props: { databaseId } };
}

describe("databaseListDragSourceId", () => {
  it("round-trips database ids through the page-list channel prefix", () => {
    expect(
      parseDatabaseListDragSourceId(databaseListDragSourceId("db-1"))
    ).toBe("db-1");
    expect(parseDatabaseListDragSourceId("page-1")).toBeNull();
  });
});

describe("canNestDatabaseUnder", () => {
  const pages = [page("home"), page("work"), page("notes")];
  const blocks = [databaseBlock("home", "db-1")];

  it("allows nesting under a different page", () => {
    expect(
      canNestDatabaseUnder({
        blocks,
        databaseId: "db-1",
        pages,
        parentPageId: "work",
      })
    ).toBe(true);
  });

  it("rejects the current host", () => {
    expect(
      canNestDatabaseUnder({
        blocks,
        databaseId: "db-1",
        pages,
        parentPageId: "home",
      })
    ).toBe(false);
  });

  it("rejects database-owned pages", () => {
    expect(
      canNestDatabaseUnder({
        blocks,
        databaseId: "db-1",
        pages: [
          ...pages,
          page("hub", { databaseSource: { databaseId: "db-1" } }),
        ],
        parentPageId: "hub",
      })
    ).toBe(false);
  });
});
