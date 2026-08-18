/**
 * @fileoverview Per-view-type options submenu (Board / Chart / Map) for the
 * database settings menu.
 *
 * Extracted from `database-settings-menu.tsx` so the menu body stays one flat
 * list of rows: a new view type adds a case here rather than another branch
 * inline.
 */
import {
  IconChartBar,
  IconLayoutKanban,
  IconMapPin,
} from "@tabler/icons-react";
import type { ReactNode } from "react";

import { BoardOptionsItems } from "@/components/database/views/database-board-config.tsx";
import { ChartOptionsItems } from "@/components/database/views/database-chart-config.tsx";
import { MapOptionsItems } from "@/components/database/views/database-map-config.tsx";
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { ChartData } from "@/lib/databases/chart-data.ts";
import type { DatabaseView, LocalDatabase } from "@/lib/schemas/database.ts";

/** Fallback when a chart view's dataset hasn't been threaded in. */
const EMPTY_CHART_DATA: ChartData = {
  categories: [],
  categoryKeys: [],
  series: [],
};

/**
 * Per-view-type options submenu (Board / Chart / Map). Extracted from
 * `DatabaseSettingsMenu` so the menu body stays one flat list of rows rather
 * than a growing chain of type conditionals — every new view type adds a case
 * here, not another branch in the menu.
 */
export function ViewTypeOptionsSubmenu({
  chartData,
  database,
  view,
}: {
  chartData?: ChartData;
  database: LocalDatabase;
  view: DatabaseView | undefined;
}): ReactNode {
  if (!view) {
    return null;
  }
  if (view.type === "board") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconLayoutKanban />
          Board options
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64 min-w-64">
          <BoardOptionsItems database={database} view={view} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  if (view.type === "chart") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconChartBar />
          Chart options
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64 min-w-64">
          <ChartOptionsItems
            data={chartData ?? EMPTY_CHART_DATA}
            database={database}
            fields={database.fields}
            view={view}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  if (view.type === "map") {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <IconMapPin />
          Map options
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-64 min-w-64">
          <MapOptionsItems
            database={database}
            fields={database.fields}
            view={view}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }
  return null;
}
