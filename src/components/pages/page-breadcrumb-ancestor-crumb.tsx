"use client";

import { Link } from "@tanstack/react-router";
import { PAGE_BREADCRUMB_CHILDREN_LIMIT } from "@/components/pages/page-breadcrumb-shared.ts";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { buttonVariants, iconSlotClassName } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  getDirectChildPages,
  getSiblingPages,
  isPageOnActiveBranch,
  pageHasDirectChildren,
} from "@/lib/pages/breadcrumb-scope.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { resolvePageNavTarget } from "@/lib/pages/resolve-page-nav-target.ts";

interface PageBreadcrumbAncestorCrumbProps {
  activePageId: string;
  ancestor: PageSummary;
  pages: PageSummary[];
}

function PageBreadcrumbMenuPageLabel({ page }: { page: PageSummary }) {
  const localPage = useLocalPageById(page.id);
  const title = localPage?.title ?? page.title;
  const icon = localPage?.icon ?? page.icon;

  return (
    <>
      <span className={iconSlotClassName("icon-sm")}>
        <PageIconDisplay icon={icon} />
      </span>
      <span className="min-w-0 truncate">{title || DEFAULT_PAGE_TITLE}</span>
    </>
  );
}

function PageBreadcrumbChildrenSubmenu({
  activePageId,
  page,
  pages,
}: {
  activePageId: string;
  page: PageSummary;
  pages: PageSummary[];
}) {
  const children = getDirectChildPages(page.id, pages);
  const visibleChildren = children.slice(0, PAGE_BREADCRUMB_CHILDREN_LIMIT);
  const hiddenCount = children.length - visibleChildren.length;
  const navTarget = resolvePageNavTarget(page.id, pages);
  const isActiveBranch = isPageOnActiveBranch(page.id, activePageId, pages);

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className="h-8 gap-2 px-2"
        closeDelay={200}
        delay={100}
        highlighted={isActiveBranch}
        openOnHover
        render={<Link {...navTarget} />}
      >
        <PageBreadcrumbMenuPageLabel page={page} />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56 min-w-56">
        {visibleChildren.map((child) => (
          <PageBreadcrumbSiblingItem
            activePageId={activePageId}
            key={child.id}
            page={child}
            pages={pages}
          />
        ))}
        {hiddenCount > 0 ? (
          <div
            className="px-2 py-1.5 font-normal text-muted-foreground text-xs"
            role="presentation"
          >
            {hiddenCount} more
          </div>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function PageBreadcrumbSiblingItem({
  activePageId,
  page,
  pages,
}: {
  activePageId: string;
  page: PageSummary;
  pages: PageSummary[];
}) {
  const navTarget = resolvePageNavTarget(page.id, pages);
  const isActiveBranch = isPageOnActiveBranch(page.id, activePageId, pages);
  const hasChildren = pageHasDirectChildren(page.id, pages);

  if (hasChildren) {
    return (
      <PageBreadcrumbChildrenSubmenu
        activePageId={activePageId}
        page={page}
        pages={pages}
      />
    );
  }

  return (
    <DropdownMenuItem
      className="h-8 gap-2 px-2"
      highlighted={isActiveBranch}
      render={<Link {...navTarget} />}
    >
      <PageBreadcrumbMenuPageLabel page={page} />
    </DropdownMenuItem>
  );
}

function PageBreadcrumbSiblingMenu({
  activePageId,
  ancestorPageId,
  pages,
}: {
  activePageId: string;
  ancestorPageId: string;
  pages: PageSummary[];
}) {
  const siblings = getSiblingPages(ancestorPageId, pages);

  return (
    <>
      {siblings.map((sibling) => (
        <PageBreadcrumbSiblingItem
          activePageId={activePageId}
          key={sibling.id}
          page={sibling}
          pages={pages}
        />
      ))}
    </>
  );
}

export function PageBreadcrumbAncestorCrumb({
  activePageId,
  ancestor,
  pages,
}: PageBreadcrumbAncestorCrumbProps) {
  const localPage = useLocalPageById(ancestor.id);
  const title = localPage?.title ?? ancestor.title;
  const icon = localPage?.icon ?? ancestor.icon;
  const navTarget = resolvePageNavTarget(ancestor.id, pages);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={buttonVariants({ variant: "ghost" })}
        closeDelay={300}
        delay={300}
        nativeButton={false}
        openOnHover
        render={<Link {...navTarget} />}
      >
        <span className={iconSlotClassName("icon-sm")}>
          <PageIconDisplay icon={icon} />
        </span>
        <span className="min-w-0 truncate">{title || DEFAULT_PAGE_TITLE}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56 min-w-56"
        side="bottom"
        sideOffset={4}
      >
        <PageBreadcrumbSiblingMenu
          activePageId={activePageId}
          ancestorPageId={ancestor.id}
          pages={pages}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
