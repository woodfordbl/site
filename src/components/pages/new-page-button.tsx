import { IconPlus } from "@tabler/icons-react";

import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { useCreatePage } from "@/hooks/use-create-page.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { pageListRowPaddingLeft } from "@/lib/pages/page-list-preview-depth.ts";
import { cn } from "@/lib/utils.ts";

function NewPageButtonLive() {
  const { pages } = useMergedPageListItems();
  const createPage = useCreatePage(pages);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn(pageListRowPaddingLeft(0), "text-sidebar-foreground/70")}
        onClick={() => createPage()}
        render={<button type="button" />}
        tooltip={{ children: "New page", command: "new-page" }}
      >
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <IconPlus aria-hidden className="size-4 shrink-0" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">New page</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function NewPageButtonStatic() {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn(pageListRowPaddingLeft(0), "text-sidebar-foreground/70")}
        render={<span aria-hidden />}
        tooltip="New page"
      >
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <IconPlus aria-hidden className="size-4 shrink-0" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">New page</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function NewPageButton() {
  const isClient = useIsClient();

  if (!isClient) {
    return <NewPageButtonStatic />;
  }

  return <NewPageButtonLive />;
}
