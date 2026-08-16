import { IconCheck, IconDots, IconPlus, IconSearch } from "@tabler/icons-react";
import { type ReactNode, useMemo, useState } from "react";

import {
  DatabaseOptionColorMenuItems,
  updateSelectOptionColor,
} from "@/components/database/database-option-color-menu.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useResolvedMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import type { DatabaseSelectOption } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

interface DatabaseOptionComboboxProps {
  /**
   * Id of the field owning `options` — option color edits are scoped by it
   * (option ids alone are ambiguous after "Duplicate property").
   */
  fieldId: string;
  /** Multi keeps toggling; single is expected to close from `onToggleOption`. */
  multiple: boolean;
  /** When set, an exact-match-less query offers a "Create" row. */
  onCreateOption?: (name: string) => void;
  onToggleOption: (optionId: string) => void;
  options: readonly DatabaseSelectOption[];
  selectedIds: readonly string[];
}

const OPTION_ROW_CLASS =
  "flex h-8 pointer-coarse:h-10 w-full shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted";

/**
 * Search-first option list shared by the select/multi-select cell editors and
 * the filter bar's option checklists: type-ahead filtering, check marks on
 * selected options, and an optional "Create" row appending a new option for
 * unmatched queries. Each option row carries a trailing ⋯ menu
 * (hover/focus-revealed on fine pointers, always visible on touch) holding the
 * option color palette — opening or picking inside it never toggles the option
 * or dismisses the hosting popover.
 */
export function DatabaseOptionCombobox({
  fieldId,
  onCreateOption,
  onToggleOption,
  options,
  selectedIds,
}: DatabaseOptionComboboxProps): ReactNode {
  const [query, setQuery] = useState("");
  const focusOnMount = useFocusOnMount();
  // In drawer presentation the drawer body scrolls (vaul's at-top drag
  // contract intact) — a popover max-height would clip long option lists.
  const isDrawer = useResolvedMenuPresentation() === "drawer";
  const trimmed = query.trim();

  const filtered = useMemo(() => {
    if (trimmed === "") {
      return [...options];
    }
    const lower = trimmed.toLowerCase();
    return options.filter((option) =>
      option.name.toLowerCase().includes(lower)
    );
  }, [options, trimmed]);

  const canCreate =
    onCreateOption !== undefined &&
    trimmed !== "" &&
    !options.some(
      (option) => option.name.toLowerCase() === trimmed.toLowerCase()
    );

  const create = () => {
    if (canCreate && onCreateOption) {
      onCreateOption(trimmed);
      setQuery("");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search options"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            const first = filtered[0];
            if (first) {
              onToggleOption(first.id);
              return;
            }
            create();
          }}
          placeholder={onCreateOption ? "Search or create…" : "Search options…"}
          ref={focusOnMount}
          value={query}
        />
      </InputGroup>
      <div
        className={cn(
          "flex flex-col",
          isDrawer ? undefined : "max-h-56 overflow-y-auto"
        )}
      >
        {filtered.map((option) => (
          <ComboboxOptionRow
            fieldId={fieldId}
            key={option.id}
            onToggle={() => onToggleOption(option.id)}
            option={option}
            selected={selectedIds.includes(option.id)}
          />
        ))}
        {canCreate ? (
          <button className={OPTION_ROW_CLASS} onClick={create} type="button">
            <IconPlus className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">Create "{trimmed}"</span>
          </button>
        ) : null}
        {filtered.length === 0 && !canCreate ? (
          <div className="px-2 py-2 text-muted-foreground text-sm">
            No options
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface ComboboxOptionRowProps {
  fieldId: string;
  onToggle: () => void;
  option: DatabaseSelectOption;
  selected: boolean;
}

/**
 * One option row: full-width toggle button with an absolute ⋯ overlay (same
 * sibling-over-row pattern as sidebar `SidebarMenuButton` + `SidebarMenuAction`).
 * Color edits never toggle the cell/filter value; the row is a
 * `data-reveal-group` so the ⋯ follows hover-reveal (always visible on
 * no-hover pointers). Color writes address the owning field schema by field id
 * + option id via `updateSelectOptionColor`.
 */
function ComboboxOptionRow({
  fieldId,
  onToggle,
  option,
  selected,
}: ComboboxOptionRowProps): ReactNode {
  return (
    <div
      className="relative shrink-0 hover-none:[&_[data-option-row-content]]:pr-8 hover:[&_[data-option-row-content]]:pr-8 has-[[data-option-row-action][aria-expanded=true]]:[&_[data-option-row-content]]:pr-8"
      data-reveal-group=""
    >
      <button
        className={cn(OPTION_ROW_CLASS, "min-w-0")}
        data-option-row-content=""
        onClick={onToggle}
        type="button"
      >
        <span
          aria-hidden
          className={cn(
            "size-2 shrink-0 rounded-full bg-current",
            option.color
              ? BLOCK_COLOR_DEFS[option.color].textClass
              : "text-muted-foreground"
          )}
        />
        <span className="min-w-0 flex-1 truncate">{option.name}</span>
        {selected ? (
          <IconCheck className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
        ) : null}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          nativeButton
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          render={
            <Button
              aria-label={`Change color for ${option.name}`}
              className="hover-reveal absolute top-1/2 right-1 z-10 -translate-y-1/2 aria-expanded:opacity-100"
              data-option-row-action=""
              size="icon-xs"
              variant="ghost"
            />
          }
        >
          <IconDots />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom">
          <DatabaseOptionColorMenuItems
            color={option.color}
            onSelectColor={(color) => {
              updateSelectOptionColor(fieldId, option.id, color);
            }}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
