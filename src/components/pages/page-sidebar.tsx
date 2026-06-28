import { IconChevronRight } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";

import {
  FavoritesList,
  useHasFavorites,
} from "@/components/pages/favorites-list.tsx";
import { PageList } from "@/components/pages/page-list.tsx";
import { PageSidebarSettingsAction } from "@/components/pages/page-sidebar-settings-action.tsx";
import { SidebarPinAction } from "@/components/pages/sidebar-pin-action.tsx";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * A sidebar section whose label doubles as a collapse toggle. The label gets the
 * same hover treatment as a normal sidebar item and, when collapsed, only the
 * label row remains visible. `action` renders to the right of the label.
 */
function SidebarCollapsibleSection({
  action,
  children,
  defaultOpen = true,
  label,
}: {
  action?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <SidebarGroup className="gap-y-px">
      <Collapsible onOpenChange={setOpen} open={open}>
        <div className="flex h-8 shrink-0 items-center">
          <CollapsibleTrigger className="group/label flex h-8 min-w-0 flex-1 items-center gap-1 rounded-md px-2 text-left font-medium text-sidebar-foreground/70 text-xs outline-hidden ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2">
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <IconChevronRight
              className={cn(
                "size-3.5 shrink-0 text-sidebar-foreground/50 opacity-0 transition-[transform,opacity] duration-100 ease-out hover-none:opacity-100 group-hover/label:opacity-100 group-focus-visible/label:opacity-100",
                open && "rotate-90"
              )}
            />
          </CollapsibleTrigger>
          {action}
        </div>
        <CollapsibleContent>
          <SidebarGroupContent>{children}</SidebarGroupContent>
        </CollapsibleContent>
      </Collapsible>
    </SidebarGroup>
  );
}

function PageSidebarPanel({ className }: { className?: string }) {
  const hasFavorites = useHasFavorites();

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
        {hasFavorites ? (
          <SidebarCollapsibleSection label="Favorites">
            <FavoritesList />
          </SidebarCollapsibleSection>
        ) : null}
        <SidebarCollapsibleSection action={<SidebarPinAction />} label="Pages">
          <PageList />
        </SidebarCollapsibleSection>
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
