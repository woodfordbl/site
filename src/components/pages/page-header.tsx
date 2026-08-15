"use client";

import { IconLayoutSidebar, IconSlash } from "@tabler/icons-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { PageBreadcrumbAncestorCrumb } from "@/components/pages/page-breadcrumb-ancestor-crumb.tsx";
import { PageBreadcrumbCurrentCrumb } from "@/components/pages/page-breadcrumb-current-crumb.tsx";
import { PageHeaderMenu } from "@/components/pages/page-header-menu.tsx";
import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import { useIsNarrowViewport } from "@/components/layout/device-layout-provider.tsx";
import type { PageCanvasFooterActionsInput } from "@/hooks/use-page-canvas-footer-actions.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { getAncestorPageIds } from "@/lib/pages/build-page-tree.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { Page } from "@/lib/schemas/page.ts";

/**
 * Header bar shared by {@link PageHeader} and the row-template surfaces that
 * build their own header. `min-h-10` pins the bar to the height of a breadcrumb
 * crumb so it does not collapse on a surface whose breadcrumb renders nothing.
 */
export const pageHeaderShellClassName =
  "flex min-h-10 shrink-0 items-center gap-1 border-sidebar-border border-b bg-background px-3 py-1";

interface PageHeaderProps extends PageCanvasFooterActionsInput {
  /**
   * Replaces the page-tree breadcrumb for surfaces whose page is not in the
   * sidebar tree (the row-template editor).
   */
  breadcrumbSlot?: ReactNode;
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<
    Page,
    "font" | "fullWidth" | "headerImage" | "textScale"
  > | null;
}

/** Desktop: expand button only when collapsed. Mobile: sheet trigger. */
export function PageHeaderSidebarToggle() {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed, isCollapsing, pinSidebar } = usePageSidebarChrome();

  if (isNarrowViewport) {
    return <SidebarTrigger className="shrink-0 text-muted-foreground" />;
  }

  if (!(isCollapsed || isCollapsing)) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1, transform: "translateX(0px)" }}
      className="flex shrink-0 items-center"
      initial={
        isCollapsing ? { opacity: 0, transform: "translateX(-6px)" } : false
      }
      transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-label="Pin sidebar open"
              onClick={pinSidebar}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <IconLayoutSidebar aria-hidden />
            </Button>
          }
        />
        <TooltipContent command="toggle-sidebar" side="bottom">
          Pin sidebar open
        </TooltipContent>
      </Tooltip>
    </motion.div>
  );
}

function PageHeaderBreadcrumb({
  pageId,
  pages,
  titleSeed,
}: {
  pageId: string;
  pages: ReturnType<typeof useMergedPageListItems>["pages"];
  titleSeed?: PageMetadataSeed;
}) {
  const isNarrowViewport = useIsNarrowViewport();
  const currentSummary = pages.find((page) => page.id === pageId);

  // On mobile the breadcrumb collapses to just the current page; ancestor crumbs
  // (and their drawer menus) are only shown on wider viewports.
  const ancestors = isNarrowViewport
    ? []
    : getAncestorPageIds(pageId, pages)
        .map((id) => pages.find((page) => page.id === id))
        .filter((page): page is NonNullable<typeof page> => Boolean(page))
        .reverse();

  if (!currentSummary) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-1 items-center gap-0.5 text-muted-foreground text-sm"
    >
      {ancestors.map((ancestor) => (
        <span className="contents" key={ancestor.id}>
          <PageBreadcrumbAncestorCrumb
            activePageId={pageId}
            ancestor={ancestor}
            pages={pages}
          />
          <IconSlash
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground/40"
          />
        </span>
      ))}
      <PageBreadcrumbCurrentCrumb
        defaultIcon={currentSummary.icon}
        defaultSlug={currentSummary.slug}
        defaultTitle={currentSummary.title}
        pageId={pageId}
        pages={pages}
        seed={titleSeed}
      />
    </nav>
  );
}

export function PageHeader({
  breadcrumbSlot,
  onAfterReset,
  pageId,
  seed,
  serverPage,
}: PageHeaderProps) {
  const { pages } = useMergedPageListItems();

  return (
    <header className={pageHeaderShellClassName}>
      <PageHeaderSidebarToggle />
      {breadcrumbSlot ?? (
        <PageHeaderBreadcrumb pageId={pageId} pages={pages} titleSeed={seed} />
      )}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <PageHeaderMenu
          onAfterReset={onAfterReset}
          pageId={pageId}
          seed={seed}
          serverPage={serverPage}
        />
      </div>
    </header>
  );
}
