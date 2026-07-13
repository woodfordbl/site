import type { ReactNode } from "react";

import { RowPropertiesPanel } from "@/components/database/row-page/row-properties-panel.tsx";
import {
  RowPropertiesOptionsMenu,
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
        <div
          className="relative mt-6 mb-4 border-border border-b pb-3"
          data-reveal-group=""
        >
          <div className="absolute top-0 right-0 z-10">
            <RowPropertiesOptionsMenu
              className="hover-reveal"
              database={database}
            />
          </div>
          <RowPropertiesPanel database={database} row={row} />
        </div>
      )}
    </div>
  );
}
