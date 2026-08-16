import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  computePageStaleState,
  findOrphanLocalPages,
  findStaleOverriddenPageIds,
  isOverriddenSummaryContentStale,
  resolvePageOrigin,
} from "@/lib/pages/resolve-page-state.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

const serverPage: Page = {
  id: "about",
  slug: "/about",
  title: "About",
  parentId: null,
  blocks: [{ id: "b1", type: "text", props: { text: "Hello" } }],
};

function localPage(overrides: Partial<LocalPage>): LocalPage {
  return {
    id: "about",
    slug: "/about",
    title: "About (local)",
    parentId: null,
    serverBaselineHash: "abc12345",
    serverMetadataBaseline: "meta1234",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolvePageOrigin", () => {
  it("returns server when no local row exists", () => {
    expect(resolvePageOrigin(serverPage, null)).toBe("server");
  });

  it("returns server-overridden for lazy-seeded local rows", () => {
    expect(resolvePageOrigin(serverPage, localPage({}))).toBe(
      "server-overridden"
    );
  });

  it("returns user for user-created pages", () => {
    expect(
      resolvePageOrigin(null, localPage({ serverBaselineHash: null }))
    ).toBe("user");
  });
});

describe("findOrphanLocalPages", () => {
  it("flags local overlays whose server id is gone", () => {
    const orphans = findOrphanLocalPages([], [localPage({ id: "removed" })]);

    expect(orphans.map((page) => page.id)).toEqual(["removed"]);
  });
});

describe("computePageStaleState", () => {
  it("detects metadata drift when baselines differ", () => {
    const stale = computePageStaleState(
      serverPage,
      localPage({ serverMetadataBaseline: "stale-hash" })
    );

    expect(stale.isMetadataStale).toBe(true);
    expect(stale.isStale).toBe(true);
  });
});

function summary(overrides: Partial<PageSummary>): PageSummary {
  return {
    id: "about",
    slug: "/about",
    title: "About",
    parentId: null,
    contentHash: "abc12345",
    ...overrides,
  };
}

describe("isOverriddenSummaryContentStale", () => {
  it("is stale when shipped content hash differs from the local baseline", () => {
    expect(
      isOverriddenSummaryContentStale(
        summary({ contentHash: "new-hash" }),
        localPage({ serverBaselineHash: "abc12345" })
      )
    ).toBe(true);
  });

  it("is not stale when hashes match", () => {
    expect(
      isOverriddenSummaryContentStale(
        summary({ contentHash: "abc12345" }),
        localPage({ serverBaselineHash: "abc12345" })
      )
    ).toBe(false);
  });

  it("ignores user-created and pristine pages", () => {
    expect(
      isOverriddenSummaryContentStale(
        summary({ contentHash: "new-hash" }),
        localPage({ serverBaselineHash: null })
      )
    ).toBe(false);
    expect(
      isOverriddenSummaryContentStale(
        summary({ contentHash: "new-hash" }),
        null
      )
    ).toBe(false);
  });
});

describe("findStaleOverriddenPageIds", () => {
  it("returns only overridden pages whose shipped content changed", () => {
    const summaries = [
      summary({ id: "about", contentHash: "new-hash" }),
      summary({ id: "home", contentHash: "abc12345" }),
      summary({ id: "user", contentHash: "whatever" }),
    ];
    const localPages = [
      localPage({ id: "about", serverBaselineHash: "abc12345" }),
      localPage({ id: "home", serverBaselineHash: "abc12345" }),
      localPage({ id: "user", serverBaselineHash: null }),
    ];

    expect(findStaleOverriddenPageIds(summaries, localPages)).toEqual([
      "about",
    ]);
  });
});
