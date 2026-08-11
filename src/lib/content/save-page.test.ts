import { describe, expect, it } from "vitest";

import { preserveShippedCreatedAt } from "@/lib/content/preserve-shipped-created-at.ts";
import type { Page } from "@/lib/schemas/page.ts";

function page(overrides: Partial<Page> & Pick<Page, "id">): Page {
  return {
    id: overrides.id,
    slug: overrides.slug ?? "/about",
    title: overrides.title ?? "About",
    parentId: overrides.parentId ?? null,
    blocks: overrides.blocks ?? [],
    ...(overrides.createdAt === undefined
      ? {}
      : { createdAt: overrides.createdAt }),
    ...(overrides.updatedAt === undefined
      ? {}
      : { updatedAt: overrides.updatedAt }),
  };
}

describe("preserveShippedCreatedAt", () => {
  it("keeps the authored createdAt over the lazy-seed one", () => {
    const result = preserveShippedCreatedAt(
      page({ id: "about", createdAt: "2026-07-01T00:00:00.000Z" }),
      [page({ id: "about", createdAt: "2026-01-01T00:00:00.000Z" })]
    );

    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("matches by id so a slug rename still finds the shipped page", () => {
    const result = preserveShippedCreatedAt(
      page({
        id: "about",
        slug: "/about-me",
        createdAt: "2026-07-01T00:00:00.000Z",
      }),
      [
        page({
          id: "about",
          slug: "/about",
          createdAt: "2026-01-01T00:00:00.000Z",
        }),
      ]
    );

    expect(result.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps the incoming createdAt when the shipped page has none", () => {
    const result = preserveShippedCreatedAt(
      page({ id: "about", createdAt: "2026-07-01T00:00:00.000Z" }),
      [page({ id: "about" })]
    );

    expect(result.createdAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("keeps the incoming createdAt for a page that has never shipped", () => {
    const result = preserveShippedCreatedAt(
      page({ id: "notes", createdAt: "2026-07-01T00:00:00.000Z" }),
      []
    );

    expect(result.createdAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("leaves updatedAt to the caller", () => {
    const result = preserveShippedCreatedAt(
      page({
        id: "about",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      }),
      [
        page({
          id: "about",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]
    );

    expect(result.updatedAt).toBe("2026-07-20T00:00:00.000Z");
  });
});
