import { useNavigate } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import { ChartPaletteScope } from "@/components/ui/chart.tsx";
import { localBlocksCollection } from "@/db/collections/local-collections.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { resolveChartPaletteId } from "@/lib/databases/chart-data.ts";
import { databaseRowNavTarget } from "@/lib/databases/database-page-paths.ts";
import {
  assignRegionBuckets,
  boundsForPoints,
  buildMapPoints,
  buildMapRegions,
  type DatabaseMapConfig,
  DEFAULT_MAP_SCALE,
  DEFAULT_MAP_VALUE_AGGREGATE,
  isMapConfigured,
  isPointMark,
  mapValueLabel,
  resolveMapJoinProperty,
  resolveMapMark,
  resolveMapPointMode,
  resolveMapValueField,
} from "@/lib/databases/map-data.ts";
import type {
  DatabaseField,
  DatabaseView,
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/**
 * @fileoverview Map saved view: renders `view.config.map` over the entry-computed row
 * pipeline. Rows arrive already filtered, sorted and formula-merged, so the
 * filter bar, sorts and search work on a map exactly as they do on the table
 * — this view only decides where each row sits.
 *
 * Coordinates come from ordinary number/text fields rather than a location
 * field type; see docs/proposals/maps.md for why that sequencing was chosen.
 * Configuration lives in the database ⋯ settings menu's "Map options" submenu.
 *
 * One view type with a `mark` switch, mirroring how `chart` handles
 * line/bar/area/pie: `pins` and `cluster` plot one point per row over the
 * tiled basemap, `region` shades bundled country polygons over a blank canvas.
 * Rows that resolve to no geometry are counted and reported, never silently
 * dropped — a map showing 40 of 60 rows lies about the data.
 *
 * The MapLibre canvas itself is a separate module behind a dynamic import
 * (`database-map-canvas.tsx`) so it never enters the server graph.
 */

/** Props contract for saved-view renderers mounted by `database-table-view.tsx`. */
export interface DatabaseMapViewProps {
  database: LocalDatabase;
  /** Full field schema (visibility is a per-view concern, applied here). */
  fields: DatabaseField[];
  mode: "view" | "edit";
  /** Filtered + sorted + formula-merged rows computed by the entry. */
  rows: LocalDatabaseRow[];
  /** The saved view being rendered (`view.type === "map"`). */
  view: DatabaseView;
}

/** ~384px map height; width stays fluid. */
const MAP_HEIGHT_CLASS = "h-96";

/**
 * Bundled Natural Earth 1:110m country polygons, trimmed to six properties
 * (269 KB). Vendored rather than hotlinked from a CDN so choropleths work
 * offline and add no third-party runtime dependency; regenerate with the same
 * property set if it is ever refreshed. Join on `ADM0_A3`, not `ISO_A3` —
 * Natural Earth stores `-99` in `ISO_A3` for France, Norway, Kosovo,
 * N. Cyprus and Somaliland, while `ADM0_A3` is unique across all 177 features.
 */
const WORLD_COUNTRIES_SOURCE = "/geo/world-countries-110m.geojson";

const EMPTY_MAP_CONFIG: DatabaseMapConfig = {};

type MapCanvasModule = typeof import("./database-map-canvas.tsx");

/** Dashed guidance panel at map height for unconfigured / empty states. */
function MapEmptyState({
  hint,
  title,
}: {
  hint?: string;
  title: string;
}): ReactNode {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-border border-dashed px-4 text-center",
        MAP_HEIGHT_CLASS
      )}
    >
      <span className="font-medium text-muted-foreground text-sm">{title}</span>
      {hint ? (
        <span className="text-muted-foreground/70 text-xs">{hint}</span>
      ) : null}
    </div>
  );
}

/** Placeholder holding map height while the MapLibre chunk loads. */
function MapLoadingState(): ReactNode {
  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-muted/40",
        MAP_HEIGHT_CLASS
      )}
    />
  );
}

/**
 * Rows that passed the view's filters but carry no usable location. Reported
 * rather than silently omitted: a map quietly showing 40 of 60 rows is a map
 * that lies about the data.
 */
function OffMapNotice({
  count,
  reason,
}: {
  count: number;
  reason: string;
}): ReactNode {
  if (count === 0) {
    return null;
  }
  return (
    <p className="px-1 text-muted-foreground text-xs">
      {count === 1 ? "1 row is" : `${count} rows are`} not on the map — {reason}
      .
    </p>
  );
}

function unconfiguredState(
  map: DatabaseMapConfig,
  mode: "view" | "edit"
): ReactNode {
  const settingsHint =
    mode === "edit"
      ? "Set it in the database settings menu under Map options."
      : "This map has no location property yet.";
  if (!isPointMark(resolveMapMark(map))) {
    return (
      <MapEmptyState
        hint={settingsHint}
        title="Pick a property holding a region code"
      />
    );
  }
  if (resolveMapPointMode(map) === "coordinate") {
    return (
      <MapEmptyState
        hint={settingsHint}
        title="Pick a property holding “latitude, longitude”"
      />
    );
  }
  return (
    <MapEmptyState
      hint={settingsHint}
      title="Pick latitude and longitude properties"
    />
  );
}

export function DatabaseMapView({
  database,
  fields,
  mode,
  rows,
  view,
}: DatabaseMapViewProps): ReactNode {
  const map = view.config.map ?? EMPTY_MAP_CONFIG;
  const mark = resolveMapMark(map);
  const pointMark = isPointMark(mark);
  const { resolvedTheme } = useSiteAppearance();
  const navigate = useNavigate();
  const [canvas, setCanvas] = useState<MapCanvasModule | null>(null);

  // MapLibre touches browser globals at import time, so the canvas module
  // loads on the client only — never in the server graph.
  useEffect(() => {
    import("./database-map-canvas.tsx")
      .then((module) => {
        setCanvas(module);
      })
      .catch(() => {
        /* client-only MapLibre bundle */
      });
  }, []);

  const points = useMemo(
    () =>
      pointMark
        ? buildMapPoints(fields, rows, map, database.primaryFieldId)
        : null,
    [database.primaryFieldId, fields, map, pointMark, rows]
  );
  const regions = useMemo(
    () => (pointMark ? null : buildMapRegions(fields, rows, map)),
    [fields, map, pointMark, rows]
  );
  const rowsById = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );
  const optionColors = useMemo(() => {
    const colors: Record<string, BlockColor | undefined> = {};
    for (const field of fields) {
      if (field.type !== "select") {
        continue;
      }
      for (const option of field.options) {
        colors[option.id] = option.color;
      }
    }
    return colors;
  }, [fields]);

  const openRow = useOpenDatabaseRow(database, rowsById, navigate);

  if (!isMapConfigured(fields, map)) {
    return unconfiguredState(map, mode);
  }

  const palette = resolveChartPaletteId(map.palette);
  const showTooltip = map.showTooltip ?? true;
  const theme = resolvedTheme === "dark" ? "dark" : "light";

  let body: ReactNode;
  let notice: ReactNode = null;

  if (pointMark && points) {
    notice = (
      <OffMapNotice
        count={points.skippedRowCount}
        reason="no valid coordinates"
      />
    );
    if (points.points.length === 0) {
      body = (
        <MapEmptyState
          hint="Rows with coordinates matching this view will appear here."
          title="No rows to plot"
        />
      );
    } else if (canvas) {
      body = (
        <canvas.DatabaseMapPointsCanvas
          bounds={boundsForPoints(points.points)}
          clustered={mark === "cluster"}
          heightClass={MAP_HEIGHT_CLASS}
          onSelectRow={openRow}
          optionColors={optionColors}
          points={points.points}
          showTooltip={showTooltip}
          theme={theme}
        />
      );
    } else {
      body = <MapLoadingState />;
    }
  } else if (regions) {
    const aggregate = map.valueAggregate ?? DEFAULT_MAP_VALUE_AGGREGATE;
    notice = (
      <OffMapNotice
        count={regions.skippedRowCount}
        reason="their region property is empty"
      />
    );
    if (regions.regions.length === 0) {
      body = (
        <MapEmptyState
          hint="Rows with a region code matching this view will appear here."
          title="No regions to shade"
        />
      );
    } else if (canvas) {
      body = (
        <canvas.DatabaseMapRegionCanvas
          buckets={assignRegionBuckets(
            regions.regions,
            map.scale ?? DEFAULT_MAP_SCALE
          )}
          heightClass={MAP_HEIGHT_CLASS}
          joinProperty={resolveMapJoinProperty(map)}
          regions={regions.regions}
          showTooltip={showTooltip}
          sourceUrl={WORLD_COUNTRIES_SOURCE}
          theme={theme}
          valueLabel={mapValueLabel(
            aggregate,
            resolveMapValueField(fields, map)
          )}
        />
      );
    } else {
      body = <MapLoadingState />;
    }
  }

  return (
    <ChartPaletteScope palette={palette}>
      <div className="flex w-full flex-col gap-2">
        {body}
        {notice}
      </div>
    </ChartPaletteScope>
  );
}

/**
 * Opens a row page from a marker click, through the same canonical slug
 * resolver the grid and list rows use. Resolving one target on demand beats
 * precomputing one per row — a map can carry thousands of markers, and only
 * the clicked one ever needs a URL.
 */
function useOpenDatabaseRow(
  database: LocalDatabase,
  rowsById: Map<string, LocalDatabaseRow>,
  navigate: ReturnType<typeof useNavigate>
): (rowId: string) => void {
  const { pages } = useMergedPageListItems();
  return useCallback(
    (rowId: string) => {
      const row = rowsById.get(rowId);
      if (!row) {
        return;
      }
      // Read the block collection at click time, not render time: the host
      // scan only matters for the one row being opened, and a captured array
      // would go stale as pages move.
      const target = databaseRowNavTarget(
        database,
        row,
        pages,
        localBlocksCollection.toArray
      );
      if (target) {
        navigate(target);
      }
    },
    [database, navigate, pages, rowsById]
  );
}
