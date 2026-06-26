"use client";

import { IconSearch } from "@tabler/icons-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  type ActionMenuEntry,
  filterActionMenuItems,
} from "@/lib/canvas/filter-action-menu-items.ts";

export function useActionMenuSearch(activeKey: string | null) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isFiltering = query.trim().length > 0;
  // On touch the menu renders as a drawer; auto-focusing would pop the
  // on-screen keyboard and shove the actions out of view.
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();

  useEffect(() => {
    if (activeKey === null) {
      return;
    }

    setQuery("");
    if (isCoarsePrimaryPointer) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [activeKey, isCoarsePrimaryPointer]);

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
    <div className="p-1 pb-2">
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
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconSearch />
          </EmptyMedia>
          <EmptyDescription>No actions found.</EmptyDescription>
        </EmptyHeader>
      </Empty>
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
      {isFiltering ? (
        <FilteredActionMenuItems items={items} query={query} />
      ) : (
        children
      )}
    </>
  );
}
