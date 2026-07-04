import { IconCheck, IconPlus, IconSearch } from "@tabler/icons-react";
import { type ReactNode, useMemo, useState } from "react";

import { DatabaseOptionPill } from "@/components/database/database-cell.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import type { DatabaseSelectOption } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

interface DatabaseOptionComboboxProps {
  /** Multi keeps toggling; single is expected to close from `onToggleOption`. */
  multiple: boolean;
  /** When set, an exact-match-less query offers a "Create" row. */
  onCreateOption?: (name: string) => void;
  onToggleOption: (optionId: string) => void;
  options: readonly DatabaseSelectOption[];
  selectedIds: readonly string[];
}

/**
 * Search-first option list shared by the select/multi-select cell editors and
 * the filter bar's option checklists: type-ahead filtering, check marks on
 * selected options, selected pills atop the list in multi mode, and an
 * optional "Create" row appending a new option for unmatched queries.
 */
export function DatabaseOptionCombobox({
  multiple,
  onCreateOption,
  onToggleOption,
  options,
  selectedIds,
}: DatabaseOptionComboboxProps): ReactNode {
  const [query, setQuery] = useState("");
  const focusOnMount = useFocusOnMount();
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

  const selectedOptions = multiple
    ? selectedIds
        .map((id) => options.find((option) => option.id === id))
        .filter((option): option is DatabaseSelectOption => Boolean(option))
    : [];

  const create = () => {
    if (canCreate && onCreateOption) {
      onCreateOption(trimmed);
      setQuery("");
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1">
          {selectedOptions.map((option) => (
            <button
              aria-label={`Remove ${option.name}`}
              className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              key={option.id}
              onClick={() => onToggleOption(option.id)}
              type="button"
            >
              <DatabaseOptionPill option={option} />
            </button>
          ))}
        </div>
      ) : null}
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
      <div className="flex max-h-56 flex-col overflow-y-auto">
        {filtered.map((option) => {
          const selected = selectedIds.includes(option.id);
          return (
            <button
              className="flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
              key={option.id}
              onClick={() => onToggleOption(option.id)}
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
          );
        })}
        {canCreate ? (
          <button
            className="flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
            onClick={create}
            type="button"
          >
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
