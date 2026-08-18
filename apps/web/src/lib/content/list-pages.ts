import { createServerFn } from "@tanstack/react-start";
import { shippedPageSummaries } from "@/lib/content/page-summaries.server.ts";

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

export const listPages = createServerFn({ method: "GET" }).handler(
  (): Promise<PageSummary[]> => Promise.resolve(shippedPageSummaries())
);
