import { IconSlash } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { useDatabasePathTargets } from "@/components/database/use-database-path-target.ts";
import { useIsNarrowViewport } from "@/components/layout/device-layout-provider.tsx";
import { PageBreadcrumbAncestorCrumb } from "@/components/pages/page-breadcrumb-ancestor-crumb.tsx";
import { breadcrumbIconFallback } from "@/components/pages/page-breadcrumb-shared.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { buttonVariants, iconSlotClassName } from "@/components/ui/button.tsx";
import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import { useDatabase } from "@/db/queries/use-database.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { findDatabaseHostPageId } from "@/lib/databases/resolve-database-host-page.ts";
import { getAncestorPageIds } from "@/lib/pages/build-page-tree.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Breadcrumb for the two row-template surfaces: editing the template itself and
 * a row's live preview. Neither has a page in the sidebar tree, so the trail is
 * built from the database's hub page (host → … → hub) and the current crumb is
 * display-only — its title and icon are edited in the title section below.
 *
 * Shared so both surfaces render a crumb of the same height as a real page
 * header: a header whose breadcrumb renders nothing collapses to the height of
 * its action button, and the chrome visibly jumps when switching modes.
 */
export function RowTemplateBreadcrumb({
  databaseId,
  icon,
  title,
}: {
  databaseId: string;
  icon: string | undefined;
  title: string;
}): ReactNode {
  const isNarrowViewport = useIsNarrowViewport();
  const { pages } = useMergedPageListItems();
  const database = useDatabase(databaseId);
  const { hub: hubTarget } = useDatabasePathTargets(databaseId);
  const hubPage = pages.find(
    (page) => page.databaseSource?.databaseId === databaseId
  );
  // Falls back to the host page when no hub page has been materialized. A
  // database only gets one the first time something needs a real page under
  // it, so a row rendered from the template — which creates nothing — would
  // otherwise show a trail of just its own name.
  const anchorId =
    hubPage?.id ??
    findDatabaseHostPageId({
      blocks: localBlocksCollection.toArray,
      databaseId,
      pages,
    });

  const ancestors = useMemo(() => {
    if (!anchorId || isNarrowViewport) {
      return [];
    }
    const anchor = pages.find((page) => page.id === anchorId);
    if (!anchor) {
      return [];
    }
    const trail = getAncestorPageIds(anchorId, pages)
      .map((id) => pages.find((page) => page.id === id))
      .filter((page): page is NonNullable<typeof page> => Boolean(page))
      .reverse();
    return [...trail, anchor];
  }, [anchorId, isNarrowViewport, pages]);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-1 items-center gap-0.5 text-muted-foreground text-sm"
    >
      {ancestors.map((ancestor) => (
        <span className="contents" key={ancestor.id}>
          <PageBreadcrumbAncestorCrumb
            activePageId={anchorId ?? ancestor.id}
            ancestor={ancestor}
            pages={pages}
          />
          <IconSlash
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/40"
          />
        </span>
      ))}
      {!hubPage && database && hubTarget && !isNarrowViewport ? (
        <span className="contents">
          <Link
            className={cn(buttonVariants({ variant: "ghost" }), "min-w-0")}
            {...hubTarget}
          >
            <span className={iconSlotClassName("icon-sm")}>
              <PageIconDisplay
                fallback={breadcrumbIconFallback(true)}
                icon={database.icon}
              />
            </span>
            <span className="min-w-0 truncate">{database.name}</span>
          </Link>
          <IconSlash
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/40"
          />
        </span>
      ) : null}
      {/* Ghost-button metrics on a plain span: the crumb is not interactive
        here, but it must occupy exactly the same box as a real current crumb. */}
      <span className={cn(buttonVariants({ variant: "ghost" }), "min-w-0")}>
        <span className={iconSlotClassName("icon-sm")}>
          <PageIconDisplay icon={icon} />
        </span>
        <span className="min-w-0 truncate">{title || DEFAULT_PAGE_TITLE}</span>
      </span>
    </nav>
  );
}
