import type { DatabaseMapConfig } from "@/lib/databases/map-data.ts";
import type { DatabaseView } from "@/lib/schemas/database.ts";

/**
 * @fileoverview Pure helpers behind the map config submenu. React-free so they stay unit
 * testable (mirrors `database-chart-config-helpers.ts`).
 */

/**
 * `updateDatabaseView` patch that shallow-merges into `config.map`, keeping
 * every other config key intact. Keys passed as `undefined` clear their slot:
 * `updateDatabaseView`'s JSON round-trip drops undefined-valued keys from the
 * stored document, so e.g. `{ colorFieldId: undefined }` removes the tint.
 */
export function mapConfigPatch(
  view: DatabaseView,
  patch: Partial<DatabaseMapConfig>
): Pick<DatabaseView, "config"> {
  return {
    config: {
      ...view.config,
      map: { ...(view.config.map ?? {}), ...patch },
    },
  };
}
