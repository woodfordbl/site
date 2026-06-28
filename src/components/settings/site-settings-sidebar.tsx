"use client";

import {
  IconArchive,
  IconChartBar,
  IconChevronLeft,
  IconCode,
  IconKeyboard,
  IconPalette,
  IconTemplate,
} from "@tabler/icons-react";
import { Link, useParams } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { SidebarPinAction } from "@/components/pages/sidebar-pin-action.tsx";
import {
  type SettingsSectionDefinition,
  type SettingsSectionId,
  settingsSectionsForNav,
} from "@/components/settings/site-settings-sections.ts";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { usePageCanvasFooterActions } from "@/hooks/use-page-canvas-footer-actions.ts";
import {
  resolveSettingsReturnTo,
  type SettingsSearch,
} from "@/lib/settings/settings-search.ts";
import { cn } from "@/lib/utils.ts";

const SECTION_ICONS: Record<SettingsSectionDefinition["icon"], ReactNode> = {
  archive: <IconArchive />,
  chart: <IconChartBar />,
  code: <IconCode />,
  keyboard: <IconKeyboard />,
  palette: <IconPalette />,
  template: <IconTemplate />,
};

const NAV_GROUPS = ["Preferences", "Workspace"] as const;

interface SiteSettingsSidebarProps {
  className?: string;
  search: SettingsSearch;
}

export function SiteSettingsSidebar({
  className,
  search,
}: SiteSettingsSidebarProps) {
  const params = useParams({ strict: false });
  const activeSection = params.section as SettingsSectionId | undefined;
  const { visible: showDevelopment } = usePageCanvasFooterActions({
    pageId: search.pageId ?? "",
  });
  const returnTo = resolveSettingsReturnTo(search);
  const sections = settingsSectionsForNav({ showDevelopment });

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
        className
      )}
      data-side="left"
      data-sidebar="sidebar"
      data-state="expanded"
      id="settings-sidebar"
    >
      <SidebarContent>
        <div className="flex shrink-0 items-center gap-1 px-2 pt-2 pr-3 pb-0">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton render={<Link to={returnTo} />}>
                <IconChevronLeft />
                <span>Back to app</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarPinAction />
        </div>

        {NAV_GROUPS.map((group) => {
          const groupSections = sections.filter(
            (section) => section.group === group
          );
          if (groupSections.length === 0) {
            return null;
          }

          return (
            <SidebarGroup className="gap-y-px" key={group}>
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-y-px">
                  {groupSections.map((section) => (
                    <SidebarMenuItem key={section.id}>
                      <SidebarMenuButton
                        isActive={activeSection === section.id}
                        render={
                          <Link
                            params={{ section: section.id }}
                            search={search}
                            to="/settings/$section"
                          />
                        }
                      >
                        {SECTION_ICONS[section.icon]}
                        <span>{section.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </div>
  );
}
