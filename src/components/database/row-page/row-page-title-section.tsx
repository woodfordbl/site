import type { ReactNode } from "react";
import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import { RowPropertiesUnderTitleBand } from "@/components/database/row-page/row-properties-rail.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { resolveDatabaseRowIcon } from "@/lib/databases/database-row-icon.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/** Shared read-only title used by template previews. */
export function RowPageTitleSection({
  database,
  displayTitle,
  icon,
  propertiesExtra,
  row,
  showProperties = true,
}: {
  database: LocalDatabase;
  displayTitle: string;
  icon?: string;
  propertiesExtra?: ReactNode;
  row: LocalDatabaseRow;
  showProperties?: boolean;
}): ReactNode {
  return (
    <div>
      <div className={pageTitleEditorLayoutClassName}>
        <div className={pageTitleIconSlotClassName}>
          <span className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground sm:size-9">
            <PageIconDisplay
              className="text-[26px] [&_svg]:size-7"
              icon={resolveDatabaseRowIcon(row, icon)}
            />
          </span>
        </div>
        <h1
          className={cn(
            "w-full min-w-0",
            headingSurfaceClassName,
            headingTypographyClassNames[1]
          )}
        >
          {displayTitle}
        </h1>
      </div>
      {showProperties ? (
        <RowPropertiesUnderTitleBand propertiesExtra={propertiesExtra}>
          <RowPropertiesPanel database={database} row={row} />
        </RowPropertiesUnderTitleBand>
      ) : null}
    </div>
  );
}
