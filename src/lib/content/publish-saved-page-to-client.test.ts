import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import { publishSavedPageToClient } from "@/lib/content/publish-saved-page-to-client.ts";
import type { Page } from "@/lib/schemas/page.ts";

function page(overrides: Partial<Page> & Pick<Page, "id" | "slug">): Page {
  return {
    id: overrides.id,
    slug: overrides.slug,
    title: overrides.title ?? "Page",
    parentId: overrides.parentId ?? null,
    blocks: overrides.blocks ?? [
      { id: "b1", type: "text", props: { text: "hello" } },
    ],
    ...(overrides.createdAt === undefined
      ? {}
      : { createdAt: overrides.createdAt }),
    ...(overrides.updatedAt === undefined
      ? {}
      : { updatedAt: overrides.updatedAt }),
  };
}

describe("publishSavedPageToClient", () => {
  it("seeds the by-slug cache and replaces the list row in place", () => {
    const queryClient = new QueryClient();
    const previous = page({ id: "about", slug: "/about", title: "About" });
    const next = page({
      id: "about",
      slug: "/about",
      title: "About",
      blocks: [{ id: "b1", type: "text", props: { text: "saved" } }],
    });

    queryClient.setQueryData(
      pageBySlugQueryOptions("/about").queryKey,
      previous
    );
    queryClient.setQueryData(pageListQueryOptions.queryKey, [
      {
        id: "home",
        slug: "/",
        title: "Home",
        parentId: null,
      },
      {
        id: "about",
        slug: "/about",
        title: "About",
        parentId: null,
        contentHash: "old",
      },
    ]);

    publishSavedPageToClient(next, queryClient);

    expect(
      queryClient.getQueryData(pageBySlugQueryOptions("/about").queryKey)
    ).toEqual(next);
    expect(queryClient.getQueryData(pageListQueryOptions.queryKey)).toEqual([
      {
        id: "home",
        slug: "/",
        title: "Home",
        parentId: null,
      },
      {
        id: "about",
        slug: "/about",
        title: "About",
        parentId: null,
        sidebarOrder: undefined,
        icon: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        contentHash: expect.any(String),
      },
    ]);
  });

  it("drops the previous by-slug entry when the page was renamed", () => {
    const queryClient = new QueryClient();
    const renamed = page({
      id: "about",
      slug: "/about-me",
      title: "About me",
    });

    queryClient.setQueryData(
      pageBySlugQueryOptions("/about").queryKey,
      page({ id: "about", slug: "/about" })
    );
    queryClient.setQueryData(pageListQueryOptions.queryKey, [
      {
        id: "about",
        slug: "/about",
        title: "About",
        parentId: null,
      },
    ]);

    publishSavedPageToClient(renamed, queryClient);

    expect(
      queryClient.getQueryData(pageBySlugQueryOptions("/about").queryKey)
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(pageBySlugQueryOptions("/about-me").queryKey)
    ).toEqual(renamed);
    expect(queryClient.getQueryData(pageListQueryOptions.queryKey)).toEqual([
      expect.objectContaining({
        id: "about",
        slug: "/about-me",
        title: "About me",
      }),
    ]);
  });
});
