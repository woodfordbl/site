import { describe, expect, it } from "vitest";

import {
  computePageStaleState,
  findOrphanLocalPages,
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
