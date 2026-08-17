"use client";

import { IconLayoutSidebar } from "@tabler/icons-react";

import { useOptionalPageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { SidebarMenuButton } from "@/components/ui/sidebar.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

/** Pins the sidebar when collapsed (hover peek overlay). */
export function SidebarPinAction() {
  const chrome = useOptionalPageSidebarChrome();

  if (!chrome?.isCollapsed) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            aria-label="Pin sidebar open"
            className="w-8 shrink-0 justify-center"
            onClick={chrome.pinSidebar}
            type="button"
          >
            <IconLayoutSidebar aria-hidden />
          </SidebarMenuButton>
        }
      />
      <TooltipContent command="toggle-sidebar" side="right">
        Pin sidebar open
      </TooltipContent>
    </Tooltip>
  );
}
