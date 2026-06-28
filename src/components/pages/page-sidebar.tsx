import { IconChevronLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import { PageList } from "@/components/pages/page-list.tsx";
import { PageSidebarSettingsAction } from "@/components/pages/page-sidebar-settings-action.tsx";
import { SidebarPinAction } from "@/components/pages/sidebar-pin-action.tsx";
import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { normalizePageSlug } from "@/lib/pages/slugify.ts";
import { cn } from "@/lib/utils.ts";

/** True when the page currently open is the configured template page. */
function useIsTemplatePageActive(): boolean {
  const { templatePageId } = useTemplatePage();
  const { pages } = useMergedPageListItems();
  const active = useActivePageRef();

  if (!(templatePageId && active.slug)) {
    return false;
  }

  const templatePage = pages.find((page) => page.id === templatePageId);
  return Boolean(
    templatePage &&
      normalizePageSlug(templatePage.slug) === normalizePageSlug(active.slug)
  );
}

/** Sidebar shown while editing the template page — a way back to its Settings home. */
function TemplatePageSidebarContent() {
  return (
    <SidebarGroup className="gap-y-px">
      <SidebarMenu className="w-fit">
        <SidebarMenuItem className="w-fit">
          <SidebarMenuButton
            className="w-fit"
            render={
              <Link params={{ section: "template" }} to="/settings/$section" />
            }
          >
            <IconChevronLeft />
            <span>Back to settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarGroupContent>
        <div className="flex flex-col gap-1 px-2 py-1.5 text-sidebar-foreground/60 text-sm">
          <p>You're editing the page template.</p>
          <p>New pages start from this page.</p>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function PageSidebarPanel({ className }: { className?: string }) {
  const onTemplatePage = useIsTemplatePageActive();

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
        className
      )}
      data-side="left"
      data-sidebar="sidebar"
      data-state="expanded"
      id="page-sidebar"
    >
      <SidebarContent>
        {onTemplatePage ? (
          <TemplatePageSidebarContent />
        ) : (
          <SidebarGroup className="gap-y-px">
            <div className="flex h-8 shrink-0 items-center justify-between pr-1">
              <SidebarGroupLabel className="min-w-0 flex-1">
                Pages
              </SidebarGroupLabel>
              <SidebarPinAction />
            </div>
            <SidebarGroupContent>
              <PageList />
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      {/* The canvas-footer settings button is hidden on mobile, so surface
        settings from the sidebar bottom on narrow viewports only. */}
      <SidebarFooter className="md:hidden">
        <SidebarMenu>
          <PageSidebarSettingsAction />
        </SidebarMenu>
      </SidebarFooter>
    </div>
  );
}

/**
 * The same sidebar panel on every breakpoint. On desktop it lives in a resizable
 * panel; on mobile {@link PageSidebarSwipeReveal} positions it behind the content
 * and reveals it with an inset swipe (replacing the former overlay sheet).
 */
export function PageSidebar() {
  return <PageSidebarPanel />;
}
