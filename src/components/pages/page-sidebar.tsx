import { IconLayoutSidebar } from "@tabler/icons-react";

import { PageList } from "@/components/pages/page-list.tsx";
import { usePageSidebarChrome } from "@/components/pages/page-sidebar-chrome.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useIsMobile } from "@/hooks/use-mobile.ts";
import { cn } from "@/lib/utils.ts";

/** Pins the sidebar when collapsed (hover peek overlay). */
function PageSidebarExpandAction() {
  const { isCollapsed, pinSidebar } = usePageSidebarChrome();

  if (!isCollapsed) {
    return null;
  }

  return (
    <Button
      aria-label="Expand sidebar"
      onClick={pinSidebar}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      <IconLayoutSidebar aria-hidden />
    </Button>
  );
}

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
            <PageSidebarExpandAction />
          </div>
          <SidebarGroupContent>
            <PageList />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </div>
  );
}

function PageSidebarMobileSheet() {
  const { openMobile, setOpenMobile } = useSidebar();

  return (
    <Sheet onOpenChange={setOpenMobile} open={openMobile}>
      <SheetContent
        className="w-[min(18rem,85vw)] bg-background p-0 text-foreground [&>button]:hidden"
        side="left"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Pages</SheetTitle>
          <SheetDescription>Page navigation sidebar.</SheetDescription>
        </SheetHeader>
        <PageSidebarPanel className="bg-background text-foreground" />
      </SheetContent>
    </Sheet>
  );
}

export function PageSidebar() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return <PageSidebarMobileSheet />;
  }

  return <PageSidebarPanel />;
}
