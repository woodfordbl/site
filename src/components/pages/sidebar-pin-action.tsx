"use client";

import { IconLayoutSidebar } from "@tabler/icons-react";

import { useOptionalPageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { SidebarMenuButton } from "@/components/ui/sidebar.tsx";

/** Pins the sidebar when collapsed (hover peek overlay). */
export function SidebarPinAction() {
  const chrome = useOptionalPageSidebarChrome();

  if (!chrome?.isCollapsed) {
    return null;
  }

  return (
    <SidebarMenuButton
      aria-label="Expand sidebar"
      className="w-8 shrink-0 justify-center"
      onClick={chrome.pinSidebar}
      type="button"
    >
      <IconLayoutSidebar aria-hidden />
    </SidebarMenuButton>
  );
}
