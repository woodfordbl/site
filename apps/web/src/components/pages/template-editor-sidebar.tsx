import { IconChevronLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";

/** Sidebar shown while editing the page template — a way back to its Settings home. */
export function TemplateEditorSidebar() {
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      data-side="left"
      data-sidebar="sidebar"
      data-state="expanded"
      id="page-sidebar"
    >
      <SidebarContent>
        <SidebarGroup className="gap-y-px">
          <SidebarMenu className="w-fit">
            <SidebarMenuItem className="w-fit">
              <SidebarMenuButton
                className="w-fit"
                render={
                  <Link
                    params={{ section: "template" }}
                    to="/settings/$section"
                  />
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
              <p>New pages start from this snapshot.</p>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </div>
  );
}
