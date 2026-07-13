import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  findDatabaseHostPageId,
  type HostScanBlock,
  resolveDatabaseHostParentId,
} from "@/lib/databases/resolve-database-host-page.ts";

const DB_ID = "db-1";

function page(
  id: string,
  slug: string,
  parentId: string | null = null
): PageSummary {
  return { id, slug, title: id, parentId };
}

function databaseBlock(pageId: string, databaseId: string): HostScanBlock {
  return { pageId, type: "database", props: { databaseId } };
}

describe("resolveDatabaseHostParentId", () => {
  it("resolves the page hosting the database block", () => {
    expect(
      resolveDatabaseHostParentId({
        blocks: [
          { pageId: "host", type: "text", props: { text: "hi" } },
          databaseBlock("host", DB_ID),
        ],
        databaseId: DB_ID,
        pages: [page("host", "/host"), page("other", "/other")],
      })
    ).toBe("host");
  });

  it("ignores database blocks referencing other databases", () => {
    expect(
      resolveDatabaseHostParentId({
        blocks: [databaseBlock("other", "db-2")],
        databaseId: DB_ID,
        pages: [page("other", "/other")],
      })
    ).toBeNull();
  });

  it("returns null when no host page exists", () => {
    expect(
      resolveDatabaseHostParentId({
        blocks: [],
        databaseId: DB_ID,
        pages: [page("a", "/a")],
      })
    ).toBeNull();
  });

  it("ignores blocks whose page is missing from the catalog", () => {
    expect(
      resolveDatabaseHostParentId({
        blocks: [databaseBlock("deleted-page", DB_ID)],
        databaseId: DB_ID,
        pages: [page("a", "/a")],
      })
    ).toBeNull();
  });

  it("picks the smallest pageId deterministically across linked views", () => {
    const pages = [page("b-host", "/b"), page("a-host", "/a")];
    const blocks = [
      databaseBlock("b-host", DB_ID),
      databaseBlock("a-host", DB_ID),
    ];
    expect(
      resolveDatabaseHostParentId({ blocks, databaseId: DB_ID, pages })
    ).toBe("a-host");
    expect(
      resolveDatabaseHostParentId({
        blocks: [...blocks].reverse(),
        databaseId: DB_ID,
        pages: [...pages].reverse(),
      })
    ).toBe("a-host");
  });

  it("handles malformed props without throwing", () => {
    expect(
      resolveDatabaseHostParentId({
        blocks: [
          { pageId: "host", type: "database", props: null },
          { pageId: "host", type: "database", props: { databaseId: 7 } },
        ],
        databaseId: DB_ID,
        pages: [page("host", "/host")],
      })
    ).toBeNull();
  });

  it("walks up to the deepest allowed ancestor when the host is at max depth", () => {
    // MAX_PAGE_DEPTH = 5: a depth-5 host cannot take a child; its depth-4
    // parent can.
    const pages = [
      page("a", "/a"),
      page("b", "/a/b", "a"),
      page("c", "/a/b/c", "b"),
      page("d", "/a/b/c/d", "c"),
      page("e", "/a/b/c/d/e", "d"),
    ];
    expect(
      resolveDatabaseHostParentId({
        blocks: [databaseBlock("e", DB_ID)],
        databaseId: DB_ID,
        pages,
      })
    ).toBe("d");
  });

  it("falls back to top-level when the over-deep host has a broken ancestor chain", () => {
    const pages = [page("leaf", "/a/b/c/d/e", "gone")];
    expect(
      resolveDatabaseHostParentId({
        blocks: [databaseBlock("leaf", DB_ID)],
        databaseId: DB_ID,
        pages,
      })
    ).toBeNull();
  });

  it("keeps a shallow host as the parent", () => {
    const pages = [page("root", "/root"), page("mid", "/root/mid", "root")];
    expect(
      resolveDatabaseHostParentId({
        blocks: [databaseBlock("mid", DB_ID)],
        databaseId: DB_ID,
        pages,
      })
    ).toBe("mid");
  });

  it("keeps a depth-3 host as the parent (hub+row still fit under MAX 5)", () => {
    const pages = [
      page("root", "/root"),
      page("mid", "/root/mid", "root"),
      page("leaf", "/root/mid/leaf", "mid"),
    ];
    expect(
      resolveDatabaseHostParentId({
        blocks: [databaseBlock("leaf", DB_ID)],
        databaseId: DB_ID,
        pages,
      })
    ).toBe("leaf");
  });
});

describe("findDatabaseHostPageId", () => {
  it("returns the raw host page without the parent depth clamp", () => {
    // A depth-5 host: resolveDatabaseHostParentId walks up to "d", but the
    // host page itself (for the breadcrumb) is still "e".
    const pages = [
      page("a", "/a"),
      page("b", "/a/b", "a"),
      page("c", "/a/b/c", "b"),
      page("d", "/a/b/c/d", "c"),
      page("e", "/a/b/c/d/e", "d"),
    ];
    const blocks = [databaseBlock("e", DB_ID)];
    expect(findDatabaseHostPageId({ blocks, databaseId: DB_ID, pages })).toBe(
      "e"
    );
    expect(
      resolveDatabaseHostParentId({ blocks, databaseId: DB_ID, pages })
    ).toBe("d");
  });

  it("picks the smallest pageId across linked views and null when absent", () => {
    const pages = [page("b-host", "/b"), page("a-host", "/a")];
    expect(
      findDatabaseHostPageId({
        blocks: [
          databaseBlock("b-host", DB_ID),
          databaseBlock("a-host", DB_ID),
        ],
        databaseId: DB_ID,
        pages,
      })
    ).toBe("a-host");
    expect(
      findDatabaseHostPageId({ blocks: [], databaseId: DB_ID, pages })
    ).toBeNull();
  });
});
