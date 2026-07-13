import type { ReactNode } from "react";

import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import {
  RowPropertiesOptionsMenu,
  RowPropertiesUnderTitleBand,
  useRowPropertiesRail,
} from "@/components/database/row-page/row-properties-rail.tsx";
import { PageTitleEditor } from "@/components/pages/page-title-editor.tsx";
import { resolveDatabaseRowIcon } from "@/lib/databases/database-row-icon.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/**
 * Row-page title slot: normal page title/icon, with properties under the title
 * whenever the properties rail is not the active placement.
 */
export function RowPageTitleSlot({
  database,
  page,
  row,
}: {
  database: LocalDatabase;
  page: LocalPage;
  row: LocalDatabaseRow;
}): ReactNode {
  const rail = useRowPropertiesRail(database);
  const icon = resolveDatabaseRowIcon(row, page.icon);

  return (
    <div>
      <PageTitleEditor
        icon={icon}
        pageHasLocalDraft
        pageId={page.id}
        slug={page.slug}
        title={page.title}
      />
      {rail.panelMode ? null : (
        <RowPropertiesUnderTitleBand
          propertiesExtra={
            <RowPropertiesOptionsMenu
              className="hover-reveal"
              database={database}
            />
          }
        >
          <RowPropertiesPanel database={database} row={row} />
        </RowPropertiesUnderTitleBand>
      )}
    </div>
  );
}
