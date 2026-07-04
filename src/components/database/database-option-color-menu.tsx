import type { ReactNode } from "react";

import { BlockColorSwatch } from "@/components/canvas/block-color-swatch.tsx";
import {
  recoloredSelectOptions,
  selectOptionsPatch,
} from "@/components/database/database-column-menu-helpers.ts";
import {
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { updateDatabaseField } from "@/db/queries/database-collection-ops.ts";
import {
  BLOCK_COLOR_DEFS,
  BLOCK_COLOR_IDS,
} from "@/lib/blocks/block-colors.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";

/**
 * Shared color palette for select/multi-select option editing. Mirrors the
 * canvas highlight picker's "Background color" section exactly — same
 * `BLOCK_COLOR_DEFS` ids/tokens, same `BlockColorSwatch` background swatches,
 * same Default-first ordering — so option pills and block highlights read as
 * one palette. Rendered inside a `DropdownMenu` (submenu in the column menu,
 * a trailing ⋯ menu in the option combobox).
 */

const DEFAULT_COLOR_VALUE = "default";

interface DatabaseOptionColorMenuItemsProps {
  color: BlockColor | undefined;
  onSelectColor: (color: BlockColor | undefined) => void;
}

/** Radio list of the block-color palette; "Default" clears the color. */
export function DatabaseOptionColorMenuItems({
  color,
  onSelectColor,
}: DatabaseOptionColorMenuItemsProps): ReactNode {
  return (
    // Label must sit inside a Group (Base UI GroupLabel requirement).
    <DropdownMenuGroup>
      <DropdownMenuLabel>Color</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        onValueChange={(value) => {
          onSelectColor(
            value === DEFAULT_COLOR_VALUE ? undefined : (value as BlockColor)
          );
        }}
        value={color ?? DEFAULT_COLOR_VALUE}
      >
        <DropdownMenuRadioItem value={DEFAULT_COLOR_VALUE}>
          <BlockColorSwatch color={undefined} variant="background" />
          Default
        </DropdownMenuRadioItem>
        {BLOCK_COLOR_IDS.map((colorId) => (
          <DropdownMenuRadioItem key={colorId} value={colorId}>
            <BlockColorSwatch color={colorId} variant="background" />
            {BLOCK_COLOR_DEFS[colorId].label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

/**
 * Write one option's color into its owning field schema, addressed by option
 * id alone. Option ids are UUIDs (unique across all databases), and the
 * option combobox is intentionally schema-location-agnostic — callers pass a
 * bare options array — so the owning database/field is point-read from the
 * collection here. Rebuilds the options array immutably via
 * `updateDatabaseField`; unknown option ids are a no-op.
 */
export function updateSelectOptionColor(
  optionId: string,
  color: BlockColor | undefined
): void {
  for (const database of localDatabasesCollection.toArray) {
    for (const field of database.fields) {
      if (field.type !== "select" && field.type !== "multiSelect") {
        continue;
      }
      if (field.options.some((option) => option.id === optionId)) {
        updateDatabaseField(
          database.id,
          field.id,
          selectOptionsPatch(
            recoloredSelectOptions(field.options, optionId, color)
          )
        );
        return;
      }
    }
  }
}
