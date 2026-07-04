import { IconCheck } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  BOARD_COLUMN_SORT_LABELS,
  BOARD_COLUMN_SORTS,
  DEFAULT_BOARD_COLUMN_SORT,
  resolveBoardCardFields,
  resolveBoardGroupField,
} from "@/components/database/views/board-helpers.ts";
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
} from "@/components/ui/dropdown-menu.tsx";
import { updateDatabaseView } from "@/db/queries/database-collection-ops.ts";
import type { DatabaseView, LocalDatabase } from "@/lib/schemas/database.ts";

/**
 * Board (kanban) settings rows, rendered inside the database ⋯ settings
 * menu's "Board" submenu (not a floating control) so every view's options
 * share one home: which select field drives the columns, how columns are
 * ordered (option order / alphabetical / by color), whether empty columns
 * hide, and which fields show on cards. Every write shallow-merges into
 * `config.board` through `updateDatabaseView` (JSON round-trip drops
 * `undefined` keys), mirroring the chart config's patch convention.
 */

type BoardConfig = NonNullable<DatabaseView["config"]["board"]>;

function boardConfigPatch(
  view: DatabaseView,
  patch: Partial<BoardConfig>
): Pick<DatabaseView, "config"> {
  return {
    config: {
      ...view.config,
      board: { ...(view.config.board ?? {}), ...patch },
    },
  };
}

export interface BoardOptionsItemsProps {
  database: LocalDatabase;
  view: DatabaseView;
}

/** The board settings rows themselves, mounted inside a `DropdownMenuSubContent`. */
export function BoardOptionsItems({
  database,
  view,
}: BoardOptionsItemsProps): ReactNode {
  const { fields } = database;
  const groupField = resolveBoardGroupField(fields, view);
  const board = view.config.board;
  const columnSort = board?.columnSort ?? DEFAULT_BOARD_COLUMN_SORT;

  const write = (patch: Partial<BoardConfig>) => {
    updateDatabaseView(database.id, view.id, boardConfigPatch(view, patch));
  };

  const selectFields = fields.filter((field) => field.type === "select");

  // Effective card fields (explicit config or the resolver's default), so
  // toggling starts from what the board actually shows.
  const effectiveCardIds = groupField
    ? resolveBoardCardFields(
        fields,
        view,
        database.primaryFieldId,
        groupField.id
      ).map((field) => field.id)
    : [];
  const cardCandidates = fields.filter(
    (field) =>
      field.id !== database.primaryFieldId && field.id !== groupField?.id
  );

  const toggleCardField = (fieldId: string) => {
    const next = effectiveCardIds.includes(fieldId)
      ? effectiveCardIds.filter((id) => id !== fieldId)
      : [...effectiveCardIds, fieldId];
    write({ cardFieldIds: next });
  };

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="shrink-0">Group by</span>
          <span className="ml-auto min-w-0 truncate pl-3 text-muted-foreground text-xs">
            {groupField?.name ?? "None"}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {selectFields.length === 0 ? (
            <p className="px-2 py-1.5 text-muted-foreground text-xs">
              Add a select property to group by.
            </p>
          ) : (
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                write({ groupFieldId: value });
              }}
              value={groupField?.id ?? ""}
            >
              {selectFields.map((field) => {
                const FieldIcon = resolveFieldIcon(field);
                return (
                  <DropdownMenuRadioItem key={field.id} value={field.id}>
                    <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
                    <span className="min-w-0 flex-1 truncate">
                      {field.name}
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <span className="shrink-0">Column order</span>
          <span className="ml-auto min-w-0 truncate pl-3 text-muted-foreground text-xs">
            {BOARD_COLUMN_SORT_LABELS[columnSort]}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              write({ columnSort: value as BoardConfig["columnSort"] });
            }}
            value={columnSort}
          >
            {BOARD_COLUMN_SORTS.map((sort) => (
              <DropdownMenuRadioItem key={sort} value={sort}>
                {BOARD_COLUMN_SORT_LABELS[sort]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSwitchItem
        checked={board?.hideEmptyColumns === true}
        onCheckedChange={(next) => {
          write({ hideEmptyColumns: next });
        }}
      >
        Hide empty columns
      </DropdownMenuSwitchItem>
      <DropdownMenuSeparator />
      <p className="px-2 pt-1.5 pb-0.5 text-muted-foreground text-xs">
        Card properties
      </p>
      {cardCandidates.length === 0 ? (
        <p className="px-2 py-1.5 text-muted-foreground text-xs">
          No other properties to show on cards.
        </p>
      ) : (
        cardCandidates.map((field) => {
          const FieldIcon = resolveFieldIcon(field);
          return (
            <DropdownMenuItem
              closeOnClick={false}
              key={field.id}
              onClick={() => {
                toggleCardField(field.id);
              }}
            >
              <FieldIcon className="stroke-[1.5px]" />
              <span className="min-w-0 flex-1 truncate">{field.name}</span>
              {effectiveCardIds.includes(field.id) ? (
                <IconCheck className="ml-auto shrink-0" />
              ) : null}
            </DropdownMenuItem>
          );
        })
      )}
    </>
  );
}
