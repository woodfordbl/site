import {
  IconChartBar,
  IconLayoutKanban,
  IconList,
  IconMapPin,
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
  map: IconMapPin,
};

/** View-type display labels ("Table" / "List" / "Board" / "Chart" / "Map"). */
export const DATABASE_VIEW_TYPE_LABELS: Record<DatabaseViewType, string> = {
  table: "Table",
  list: "List",
  board: "Board",
  chart: "Chart",
  map: "Map",
};

/**
 * Resolved glyph for a saved view: custom `view.icon` when set, otherwise the
 * fixed type icon (Table / List / Board / Chart / Map).
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
