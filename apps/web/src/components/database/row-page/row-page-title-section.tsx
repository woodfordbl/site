import type { ReactNode } from "react";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import { RowPropertiesUnderTitleBand } from "@/components/database/row-page/row-properties-rail.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import {
  setDatabaseRowIcon,
  updateDatabaseCell,
} from "@/db/queries/database-collection-ops.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { resolveDatabaseRowIcon } from "@/lib/databases/database-row-icon.ts";
import { resolveDatabaseRowPageTitle } from "@/lib/databases/database-row-page-title.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconButtonClassName,
  pageTitleIconPickerClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/** Editable row metadata shown above the shared template body in Live Preview. */
export function RowPageTitleSection({
  database,
  icon,
  propertiesExtra,
  row,
  showProperties = true,
}: {
  database: LocalDatabase;
  icon?: string;
  propertiesExtra?: ReactNode;
  row: LocalDatabaseRow;
  showProperties?: boolean;
}): ReactNode {
  const displayTitle = resolveDatabaseRowPageTitle(database, row);
  const primaryField = database.fields.find(
    (field) => field.id === database.primaryFieldId
  );

  const persistTitle = (value: string): void => {
    updateDatabaseCell(row.id, database.primaryFieldId, value.trim() || null);
  };

  return (
    <div>
      <div className={pageTitleEditorLayoutClassName}>
        <div className={pageTitleIconSlotClassName}>
          <GlyphIconPicker
            ariaLabel="Change row icon"
            className={pageTitleIconPickerClassName}
            icon={resolveDatabaseRowIcon(row, icon)}
            onRemove={
              row.icon
                ? () => {
                    setDatabaseRowIcon(row.id, undefined);
                  }
                : undefined
            }
            onSelect={(nextIcon) => {
              setDatabaseRowIcon(row.id, nextIcon);
            }}
            triggerButtonSize="icon"
            triggerClassName={pageTitleIconButtonClassName}
          />
        </div>
        <input
          aria-label="Row name"
          className={cn(
            "w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50",
            headingSurfaceClassName,
            headingTypographyClassNames[1]
          )}
          defaultValue={displayTitle === "Untitled" ? "" : displayTitle}
          key={`${row.id}:${displayTitle}`}
          onBlur={(event) => {
            persistTitle(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              persistTitle(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
          placeholder={primaryField?.name ?? "Name"}
          type="text"
        />
      </div>
      {showProperties ? (
        <RowPropertiesUnderTitleBand propertiesExtra={propertiesExtra}>
          <RowPropertiesPanel database={database} row={row} />
        </RowPropertiesUnderTitleBand>
      ) : null}
    </div>
  );
}
