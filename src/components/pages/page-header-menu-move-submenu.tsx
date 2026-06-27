"use client";

import { IconSearch } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  filterPageMoveTargetItems,
  hasPageMoveTargets,
} from "@/lib/pages/page-move-targets.ts";

interface PageHeaderMenuMoveSubmenuProps {
  onMoveTo: (parentId: string | null) => void;
  pageId: string;
  pages: PageSummary[];
}

export function PageHeaderMenuMoveSubmenu({
  onMoveTo,
  pageId,
  pages,
}: PageHeaderMenuMoveSubmenuProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const enabled = hasPageMoveTargets(pageId, pages);

  const items = useMemo(
    () => filterPageMoveTargetItems(query, pageId, pages),
    [pageId, pages, query]
  );

  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (open) {
          setQuery("");
          requestAnimationFrame(() => {
            searchRef.current?.focus();
          });
        }
      }}
    >
      <DropdownMenuSubTrigger disabled={!enabled}>
        Move to
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-56">
        <div className="p-1 pb-2">
          <InputGroup className="h-8">
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <IconSearch />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search pages"
              autoComplete="off"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                event.stopPropagation();
              }}
              placeholder="Search pages…"
              ref={searchRef}
              value={query}
            />
          </InputGroup>
        </div>
        {items.length === 0 ? (
          <div className="px-2 py-3 text-muted-foreground text-sm">
            No pages found.
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => {
                onMoveTo(item.parentId);
              }}
            >
              {item.id === "move-top-level" ? (
                <item.icon />
              ) : (
                <PageIconDisplay
                  className="size-4 [&_[role=img]]:text-sm [&_svg]:size-4"
                  icon={item.pageIcon}
                />
              )}
              {item.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
