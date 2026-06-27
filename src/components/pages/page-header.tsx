"use client";

import { IconLayoutSidebar, IconPhoto, IconSlash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageBreadcrumbAncestorCrumb } from "@/components/pages/page-breadcrumb-ancestor-crumb.tsx";
import { PageBreadcrumbCurrentCrumb } from "@/components/pages/page-breadcrumb-current-crumb.tsx";
import { usePageCover } from "@/components/pages/page-cover-context.tsx";
import { prefetchUnsplashDefaults } from "@/components/pages/page-cover-unsplash-panel.tsx";
import { PageHeaderMenu } from "@/components/pages/page-header-menu.tsx";
import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SidebarTrigger } from "@/components/ui/sidebar.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import type { PageCanvasFooterActionsInput } from "@/hooks/use-page-canvas-footer-actions.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { getAncestorPageIds } from "@/lib/pages/build-page-tree.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import type { Page } from "@/lib/schemas/page.ts";

interface PageHeaderProps extends PageCanvasFooterActionsInput {
  pageId: string;
  seed?: PageMetadataSeed;
  serverPage?: Pick<
    Page,
    "font" | "fullWidth" | "smallText" | "headerImage"
  > | null;
}

/** Desktop: expand button only when collapsed. Mobile: sheet trigger. */
function PageHeaderSidebarToggle() {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed, pinSidebar } = usePageSidebarChrome();

  if (isNarrowViewport) {
    return <SidebarTrigger className="shrink-0 text-muted-foreground" />;
  }

  if (!isCollapsed) {
    return null;
  }

  return (
    <Button
      aria-label="Expand sidebar"
      className="shrink-0"
      onClick={pinSidebar}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <IconLayoutSidebar aria-hidden />
    </Button>
  );
}

/** Quick add/change-cover button; prefetches the Unsplash default feed on hover. */
function PageHeaderCoverButton() {
  const cover = usePageCover();
  const queryClient = useQueryClient();

  if (!cover) {
    return null;
  }

  return (
    <Button
      aria-label={cover.headerImage ? "Change cover" : "Add cover"}
      className="shrink-0 text-muted-foreground"
      onClick={cover.openPicker}
      onPointerEnter={() => prefetchUnsplashDefaults(queryClient)}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <IconPhoto aria-hidden />
    </Button>
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
  onAfterReset,
  pageId,
  seed,
  serverPage,
}: PageHeaderProps) {
  const { pages } = useMergedPageListItems();

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-sidebar-border border-b px-3">
      <PageHeaderSidebarToggle />
      <PageHeaderBreadcrumb pageId={pageId} pages={pages} titleSeed={seed} />
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <PageHeaderCoverButton />
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
