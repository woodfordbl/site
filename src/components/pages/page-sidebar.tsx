import { PageList } from "@/components/pages/page-list.tsx";
import { SidebarPinAction } from "@/components/pages/sidebar-pin-action.tsx";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar.tsx";
import { cn } from "@/lib/utils.ts";

function PageSidebarPanel({ className }: { className?: string }) {
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
      </SidebarContent>
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
