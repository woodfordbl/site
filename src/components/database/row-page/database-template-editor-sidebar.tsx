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
import type { LocalDatabase } from "@/lib/schemas/database.ts";

/** Sidebar shown while editing a database's row template — a way back to it. */
export function DatabaseTemplateEditorSidebar({
  database,
}: {
  database: LocalDatabase;
}) {
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
                    params={{ databaseId: database.id }}
                    to="/db/$databaseId"
                  />
                }
              >
                <IconChevronLeft />
                <span className="min-w-0 truncate">
                  Back to {database.name}
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1 px-2 py-1.5 text-sidebar-foreground/60 text-sm">
              <p>
                You're editing the row template for{" "}
                <span className="text-sidebar-foreground/80">
                  {database.name}
                </span>
                .
              </p>
              <p>Every row's page renders from it.</p>
              <p>
                Reference the row's values with{" "}
                <code className="font-mono text-xs">
                  {"{{ thisPage.Field }}"}
                </code>{" "}
                tokens.
              </p>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </div>
  );
}
