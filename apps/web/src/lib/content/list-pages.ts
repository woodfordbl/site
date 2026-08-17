import { createServerFn } from "@tanstack/react-start";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { getShippedPages } from "@/lib/content/page-store.server.ts";
import type { Page } from "@/lib/schemas/page.ts";

export interface PageSummary {
  /** `hashPageBlocks(page.blocks)` of the shipped page; absent for local-only rows. Drives global stale detection. */
  contentHash?: string;
  /** Authored creation time from shipped JSON; absent on older content. */
  createdAt?: string;
  /**
   * Ids of the databases this **shipped** page's blocks embed. Set only for
   * pristine shipped pages — once a page has a local override its blocks are
   * authoritative and this is dropped in `mergePageList`, so a database block
   * the user deleted locally never resurrects as a host. Lets the host scan
   * resolve a database hosted by a page nobody has edited yet, whose blocks
   * live in shipped JSON rather than the local block collection.
   */
  databaseIds?: string[];
  /**
   * Present on pages materialized from a database row: excluded from the
   * sidebar tree (the database owns the sidebar entry) but resolvable
   * everywhere else (routing, search, breadcrumbs).
   */
  databaseRowSource?: { databaseId: string; rowId: string };
  /** Present on a database hub page, which is not sidebar-visible. */
  databaseSource?: { databaseId: string };
  icon?: string;
  id: string;
  parentId: string | null;
  /** How to navigate to this page in the sidebar and links. */
  routeBy?: "id" | "slug";
  sidebarOrder?: number;
  slug: string;
  title: string;
  /** Authored last-edit time from shipped JSON; absent on older content. */
  updatedAt?: string;
}

function shippedDatabaseIds(blocks: Page["blocks"]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "database" && block.props.databaseId !== "") {
      ids.add(block.props.databaseId);
    }
  }
  return [...ids];
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
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      contentHash: hashPageBlocks(page.blocks),
      databaseIds: shippedDatabaseIds(page.blocks),
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
