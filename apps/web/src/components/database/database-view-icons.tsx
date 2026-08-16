import {
  IconChartBar,
  IconLayoutKanban,
  IconList,
  IconTable,
} from "@tabler/icons-react";
import type { ComponentType, ReactNode } from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import type { DatabaseView, DatabaseViewType } from "@/lib/schemas/database.ts";

/** View-type glyphs shared by the switcher tabs and the Add-view menus. */
export const DATABASE_VIEW_TYPE_ICONS: Record<
  DatabaseViewType,
  ComponentType<{ className?: string }>
> = {
  table: IconTable,
  list: IconList,
  board: IconLayoutKanban,
  chart: IconChartBar,
};

/** View-type display labels ("Table" / "List" / "Board" / "Chart"). */
export const DATABASE_VIEW_TYPE_LABELS: Record<DatabaseViewType, string> = {
  table: "Table",
  list: "List",
  board: "Board",
  chart: "Chart",
};

/**
 * Resolved glyph for a saved view: custom `view.icon` when set, otherwise the
 * fixed type icon (Table / List / Board / Chart).
 */
export function resolveViewIconDisplay(
  view: DatabaseView,
  className = "size-4 shrink-0 stroke-[1.5px]"
): ReactNode {
  if (view.icon) {
    return <PageIconDisplay className="[&_svg]:size-4" icon={view.icon} />;
  }
  const TypeIcon = DATABASE_VIEW_TYPE_ICONS[view.type];
  return <TypeIcon className={className} />;
}
