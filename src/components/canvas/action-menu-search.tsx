"use client";

import { IconSearch } from "@tabler/icons-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import {
  type ActionMenuEntry,
  filterActionMenuItems,
} from "@/lib/canvas/filter-action-menu-items.ts";

export function useActionMenuSearch(activeKey: string | null) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isFiltering = query.trim().length > 0;

  useEffect(() => {
    if (activeKey === null) {
      return;
    }

    setQuery("");
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [activeKey]);

  return { inputRef, isFiltering, query, setQuery };
}

interface ActionMenuSearchProps {
  inputRef: RefObject<HTMLInputElement | null>;
  onQueryChange: (query: string) => void;
  query: string;
}

export function ActionMenuSearch({
  inputRef,
  onQueryChange,
  query,
}: ActionMenuSearchProps) {
  return (
    <div className="px-1 pb-1">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search actions"
          autoComplete="off"
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
          placeholder="Search actions…"
          ref={inputRef}
          value={query}
        />
      </InputGroup>
    </div>
  );
}

interface FilteredActionMenuItemsProps {
  items: ActionMenuEntry[];
  query: string;
}

export function FilteredActionMenuItems({
  items,
  query,
}: FilteredActionMenuItemsProps) {
  const filteredItems = useMemo(
    () => filterActionMenuItems(items, query),
    [items, query]
  );

  if (filteredItems.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-muted-foreground text-sm">
        No actions found.
      </div>
    );
  }

  return filteredItems.map((item) => (
    <DropdownMenuItem
      key={item.id}
      onClick={() => {
        item.onSelect();
      }}
      variant={item.destructive ? "destructive" : "default"}
    >
      {item.icon}
      {item.label}
    </DropdownMenuItem>
  ));
}

interface ActionMenuSearchSectionProps {
  activeKey: string | null;
  children: React.ReactNode;
  items: ActionMenuEntry[];
}

export function ActionMenuSearchSection({
  activeKey,
  children,
  items,
}: ActionMenuSearchSectionProps) {
  const { inputRef, isFiltering, query, setQuery } =
    useActionMenuSearch(activeKey);

  return (
    <>
      <ActionMenuSearch
        inputRef={inputRef}
        onQueryChange={setQuery}
        query={query}
      />
      <DropdownMenuSeparator />
      {isFiltering ? (
        <FilteredActionMenuItems items={items} query={query} />
      ) : (
        children
      )}
    </>
  );
}
