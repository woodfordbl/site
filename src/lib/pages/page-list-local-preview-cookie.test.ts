// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import { LOCAL_DELETE_BASELINE_HASH } from "@/lib/pages/page-delete.ts";
import {
  localPagePreviewEntriesFromPages,
  localPagesFromPreviewEntries,
  PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME,
  parsePageListLocalPreviewCookie,
  serializePageListLocalPreviewCookie,
} from "@/lib/pages/page-list-local-preview-cookie.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

vi.mock("@/lib/local-draft/dirty-pages-cookie.ts", () => ({
  readDirtyPageIdsFromDocument: () => new Set<string>(),
}));

function clearPreviewCookie(): void {
  document.cookie = `${PAGE_LIST_LOCAL_PREVIEW_COOKIE_NAME}=; path=/; max-age=0`;
}

function localPage(
  overrides: Partial<LocalPage> & Pick<LocalPage, "id">
): LocalPage {
  return {
    id: overrides.id,
    slug: overrides.slug ?? "/about",
    title: overrides.title ?? "About",
    icon: overrides.icon,
    parentId: overrides.parentId ?? null,
    serverBaselineHash:
      overrides.serverBaselineHash === undefined
        ? "hash"
        : overrides.serverBaselineHash,
    deletedAt: overrides.deletedAt,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

const serverPages: PageSummary[] = [
  { id: "home", slug: "/", title: "Home", parentId: null },
  { id: "about", slug: "/about", title: "About", parentId: null },
];

describe("localPagePreviewEntriesFromPages", () => {
  it("includes delete tombstones even when the page is not dirty", () => {
    const entries = localPagePreviewEntriesFromPages([
      localPage({
        id: "about",
        serverBaselineHash: LOCAL_DELETE_BASELINE_HASH,
        deletedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);

    expect(entries).toEqual([
      expect.objectContaining({
        id: "about",
        deletedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
  });

  it("excludes pristine shipped pages with no local overlay", () => {
    expect(localPagePreviewEntriesFromPages([])).toEqual([]);
  });
});

describe("parsePageListLocalPreviewCookie", () => {
  it("round-trips deletedAt through serialize and parse", () => {
    const entries = [
      {
        id: "about",
        slug: "/about",
        title: "About",
        parentId: null,
        serverBaselineHash: LOCAL_DELETE_BASELINE_HASH,
        deletedAt: "2026-01-02T00:00:00.000Z",
      },
    ];

    const parsed = parsePageListLocalPreviewCookie(
      serializePageListLocalPreviewCookie(entries) ?? undefined
    );

    expect(parsed).toEqual(entries);
  });
});

describe("localPagesFromPreviewEntries", () => {
  it("passes deletedAt into LocalPage stubs for mergePageList", () => {
    const merged = mergePageList(
      serverPages,
      localPagesFromPreviewEntries([
        {
          id: "about",
          slug: "/about",
          title: "About",
          parentId: null,
          serverBaselineHash: LOCAL_DELETE_BASELINE_HASH,
          deletedAt: "2026-01-02T00:00:00.000Z",
        },
      ])
    );

    expect(merged.map((page) => page.id)).toEqual(["home"]);
  });
});

afterEach(() => {
  clearPreviewCookie();
});
