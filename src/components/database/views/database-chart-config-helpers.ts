import {
  CHART_COLOR_TOKEN_COUNT,
  type DatabaseChartConfig,
} from "@/lib/databases/chart-data.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

/**
 * Pure helpers behind the chart config popover. React-free so they stay unit
 * testable (mirrors `database-column-menu-helpers.ts`).
 */

/**
 * `updateDatabaseView` patch that shallow-merges into `config.chart`, keeping
 * every other config key intact. Keys passed as `undefined` clear their slot:
 * `updateDatabaseView`'s JSON round-trip drops undefined-valued keys from the
 * stored document, so e.g. `{ seriesFieldId: undefined }` removes the split.
 */
export function chartConfigPatch(
  view: DatabaseView,
  patch: Partial<DatabaseChartConfig>
): Pick<DatabaseView, "config"> {
  return {
    config: {
      ...view.config,
      chart: { ...(view.config.chart ?? {}), ...patch },
    },
  };
}

/**
 * `colorOverrides` after one swatch click on a series/slice: the effective
 * token index advances 1→2→…→5→1 and is stored explicitly for that key.
 * Other overrides are preserved.
 */
export function cycledColorOverrides(
  overrides: Record<string, number> | undefined,
  key: string,
  effectiveIndex: number
): Record<string, number> {
  const next = (effectiveIndex % CHART_COLOR_TOKEN_COUNT) + 1;
  return { ...(overrides ?? {}), [key]: next };
}
