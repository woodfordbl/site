import { createServerFn } from "@tanstack/react-start";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { getShippedPages } from "@/lib/content/page-store.server.ts";

export interface PageSummary {
  /** `hashPageBlocks(page.blocks)` of the shipped page; absent for local-only rows. Drives global stale detection. */
  contentHash?: string;
  icon?: string;
  id: string;
  parentId: string | null;
  /** How to navigate to this page in the sidebar and links. */
  routeBy?: "id" | "slug";
  sidebarOrder?: number;
  slug: string;
  title: string;
}

export const listPages = createServerFn({ method: "GET" }).handler(
  (): Promise<PageSummary[]> => {
    const pages = getShippedPages().map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      parentId: page.parentId,
      sidebarOrder: page.sidebarOrder,
      icon: page.icon,
      contentHash: hashPageBlocks(page.blocks),
    }));

    return Promise.resolve(
      pages.sort((left, right) =>
        left.title.localeCompare(right.title, undefined, {
          sensitivity: "base",
        })
      )
    );
  }
);
