import { describe, expect, it } from "vitest";

import { LOCAL_DELETE_BASELINE_HASH } from "@/lib/pages/page-delete.ts";
import { resolveActiveUserPageBySlug } from "@/lib/pages/resolve-user-page-by-slug.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

function localPage(
  overrides: Partial<LocalPage> & Pick<LocalPage, "id">
): LocalPage {
  return {
    id: overrides.id,
    slug: overrides.slug ?? "/new-page",
    title: overrides.title ?? "New Page",
    parentId: overrides.parentId ?? null,
    serverBaselineHash:
      overrides.serverBaselineHash === undefined
        ? null
        : overrides.serverBaselineHash,
    deletedAt: overrides.deletedAt,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveActiveUserPageBySlug", () => {
  it("prefers a live user page over a delete tombstone with the same slug", () => {
    const pages: LocalPage[] = [
      localPage({
        id: "tombstone",
        serverBaselineHash: LOCAL_DELETE_BASELINE_HASH,
        deletedAt: "2026-01-02T00:00:00.000Z",
      }),
      localPage({ id: "live", serverBaselineHash: null }),
    ];

    expect(resolveActiveUserPageBySlug(pages, "/new-page")?.id).toBe("live");
  });
});
