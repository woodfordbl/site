import { IconDatabase, IconSearch } from "@tabler/icons-react";
import { useLiveQuery } from "@tanstack/react-db";
import { type ReactNode, useMemo, useState } from "react";

import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { iconSlotClassName } from "@/components/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useResolvedMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { cn } from "@/lib/utils.ts";

interface DatabaseLinkPickerProps {
  /** Currently-linked database, filtered out so it isn't offered again. */
  excludeDatabaseId?: string;
  /** Fired with the chosen existing database id. */
  onSelect: (databaseId: string) => void;
}

interface DatabaseLinkOption {
  icon?: string;
  id: string;
  name: string;
}

const ROW_CLASS =
  "flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted";

/**
 * Search-first single-select over every workspace database, powering the
 * database block's **Linked** tab: type-ahead substring filtering (the shared
 * `.includes()` convention — no fuzzy lib), Enter selects the top match, and a
 * row click links that database. Selecting fires `onSelect(databaseId)` — no
 * new database is created; the block simply adopts an existing one's id.
 */
export function DatabaseLinkPicker({
  excludeDatabaseId,
  onSelect,
}: DatabaseLinkPickerProps): ReactNode {
  const [query, setQuery] = useState("");
  const focusOnMount = useFocusOnMount();
  // Drawer body scrolls on coarse pointers; a popover max-height would clip.
  const isDrawer = useResolvedMenuPresentation() === "drawer";
  const trimmed = query.trim();

  const { data: databases = [] } = useLiveQuery((q) =>
    q.from({ database: localDatabasesCollection })
  );

  const options = useMemo<DatabaseLinkOption[]>(() => {
    const lower = trimmed.toLowerCase();
    return databases
      .filter((database) => database.id !== excludeDatabaseId)
      .filter(
        (database) =>
          lower === "" || database.name.toLowerCase().includes(lower)
      )
      .map((database) => ({
        icon: database.icon,
        id: database.id,
        name: database.name,
      }))
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          }) || left.id.localeCompare(right.id)
      );
  }, [databases, excludeDatabaseId, trimmed]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search databases"
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key !== "Enter") {
              return;
            }
            event.preventDefault();
            const first = options[0];
            if (first) {
              onSelect(first.id);
            }
          }}
          placeholder="Search databases…"
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
        {options.map((option) => (
          <button
            className={ROW_CLASS}
            key={option.id}
            onClick={() => onSelect(option.id)}
            type="button"
          >
            <span className={iconSlotClassName("icon-xs", "relative size-4")}>
              {option.icon ? (
                <PageIconDisplay icon={option.icon} />
              ) : (
                <IconDatabase className="size-4 stroke-[1.5px]" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{option.name}</span>
          </button>
        ))}
        {options.length === 0 ? (
          <div className="px-2 py-2 text-muted-foreground text-sm">
            {databases.length === 0
              ? "No databases in this workspace yet."
              : "No matching databases."}
          </div>
        ) : null}
      </div>
    </div>
  );
}
