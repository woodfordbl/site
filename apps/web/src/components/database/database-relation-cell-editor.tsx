import { IconCheck, IconSearch } from "@tabler/icons-react";
import { type ReactNode, useMemo, useState } from "react";

import { CellEditorPopover } from "@/components/database/database-cell-editor-popover.tsx";
import { useFocusOnMount } from "@/components/database/use-focus-on-mount.ts";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { useResolvedMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import { updateDatabaseCell } from "@/db/queries/database-collection-ops.ts";
import { useDatabase, useDatabaseRows } from "@/db/queries/use-database.ts";
import {
  cellToPlainText,
  coerceCellValue,
} from "@/lib/databases/cell-values.ts";
import { compareManualOrder } from "@/lib/databases/row-sort.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview Relation cell editor — the structural analog of the
 * multi-select combobox, over another database's rows.
 *
 * Split out of `database-cell-editor.tsx` so that host stays the editor
 * dispatcher plus the inline text/number editors; it is reached only through
 * `DatabaseCellInlineEditor`.
 */

interface RelationCellPopoverEditorProps {
  field: Extract<DatabaseField, { type: "relation" }>;
  onStopEdit: () => void;
  rowId: string;
  value: DatabaseCellValue | undefined;
}

/** One target row offered by the relation editor's searchable list. */
interface RelationRowEntry {
  id: string;
  title: string;
}

/**
 * Searchable by title (the target's primary field; blank titles read
 * "Untitled"), checkbox-style multi-toggle writing a target-row id array
 * through `updateDatabaseCell`. Rows list in manual order
 * (`compareManualOrder`); synced target rows (`pageId` null) list like any
 * other. No create-row affordance in v1.
 */
export function RelationCellPopoverEditor({
  field,
  onStopEdit,
  rowId,
  value,
}: RelationCellPopoverEditorProps): ReactNode {
  const coerced = coerceCellValue(field, value);
  const selectedIds = useMemo<string[]>(
    () => (Array.isArray(coerced) ? coerced : []),
    [coerced]
  );
  const targetDatabase = useDatabase(field.targetDatabaseId);
  const targetRows = useDatabaseRows(field.targetDatabaseId);

  const entries = useMemo<RelationRowEntry[]>(() => {
    const primaryField = targetDatabase?.fields.find(
      (entry) => entry.id === targetDatabase.primaryFieldId
    );
    if (!primaryField) {
      return [];
    }
    return [...targetRows].sort(compareManualOrder).map((row) => {
      const title = cellToPlainText(
        primaryField,
        row.values[primaryField.id]
      ).trim();
      return { id: row.id, title: title === "" ? "Untitled" : title };
    });
  }, [targetDatabase, targetRows]);

  const handleToggle = (targetRowId: string) => {
    const next = selectedIds.includes(targetRowId)
      ? selectedIds.filter((id) => id !== targetRowId)
      : [...selectedIds, targetRowId];
    updateDatabaseCell(rowId, field.id, next.length > 0 ? next : null);
  };

  return (
    <CellEditorPopover onStopEdit={onStopEdit}>
      <RelationRowCombobox
        entries={entries}
        onToggle={handleToggle}
        selectedIds={selectedIds}
      />
    </CellEditorPopover>
  );
}

interface RelationRowComboboxProps {
  entries: readonly RelationRowEntry[];
  onToggle: (rowId: string) => void;
  selectedIds: readonly string[];
}

/**
 * Search-first target-row list: type-ahead title filtering, check marks on
 * linked rows, toggling keeps the popover open (multi-value). Mirrors
 * `DatabaseOptionCombobox`'s drawer handling — in drawer presentation the
 * drawer body scrolls, so the popover max-height is dropped.
 */
function RelationRowCombobox({
  entries,
  onToggle,
  selectedIds,
}: RelationRowComboboxProps): ReactNode {
  const [query, setQuery] = useState("");
  const focusOnMount = useFocusOnMount();
  const isDrawer = useResolvedMenuPresentation() === "drawer";
  const trimmed = query.trim();

  const filtered = useMemo(() => {
    if (trimmed === "") {
      return [...entries];
    }
    const lower = trimmed.toLowerCase();
    return entries.filter((entry) => entry.title.toLowerCase().includes(lower));
  }, [entries, trimmed]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search rows"
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
              onToggle(first.id);
            }
          }}
          placeholder="Search rows…"
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
        {filtered.map((entry) => (
          <button
            // Row affordances match the option combobox's list rows.
            className="flex h-8 pointer-coarse:h-10 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
            key={entry.id}
            onClick={() => onToggle(entry.id)}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">{entry.title}</span>
            {selectedIds.includes(entry.id) ? (
              <IconCheck className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            ) : null}
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="px-2 py-2 text-muted-foreground text-sm">No rows</div>
        ) : null}
      </div>
    </div>
  );
}
