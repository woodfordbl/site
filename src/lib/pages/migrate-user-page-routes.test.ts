import { describe, expect, it } from "vitest";

import type { PageSummary } from "@/lib/content/list-pages.ts";
import { planUserPageSlugMigrations } from "@/lib/pages/migrate-user-page-routes.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

const serverPages: PageSummary[] = [
  {
    id: "server-new-page",
    slug: "/new-page",
    title: "New Page",
    parentId: null,
    routeBy: "slug",
  },
];

function userLocal(
  overrides: Partial<LocalPage> & Pick<LocalPage, "id">
): LocalPage {
  return {
    id: overrides.id,
    slug: overrides.slug ?? "/new-page",
    title: overrides.title ?? "New Page",
    parentId: overrides.parentId ?? null,
    serverBaselineHash: null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("planUserPageSlugMigrations", () => {
  it("re-slugs user pages that shadow a shipped page path", () => {
    const migrations = planUserPageSlugMigrations(serverPages, [
      userLocal({ id: "user-a", createdAt: "2026-01-02T00:00:00.000Z" }),
    ]);

    expect(migrations).toEqual([{ pageId: "user-a", newSlug: "/new-page-2" }]);
  });
});
