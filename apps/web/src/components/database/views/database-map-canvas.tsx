"use client";

import type { FeatureCollection, Point } from "geojson";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MapMarkerCard,
  MapRegionCard,
} from "@/components/database/views/database-map-tooltip.tsx";
import { MapOverlayControls } from "@/components/maps/map-overlay-controls.tsx";
import {
  Map,
  MapClusterLayer,
  MapGeoJSON,
  MapMarker,
  MarkerContent,
  MarkerTooltip,
} from "@/components/ui/map.tsx";
import { cssColorToRgb } from "@/lib/charts/dither-texture.ts";
import type {
  MapBounds,
  MapPoint,
  MapRegion,
} from "@/lib/databases/map-data.ts";
import {
  MAP_REGION_BUCKET_COUNT,
  normalizeRegionKey,
} from "@/lib/databases/map-data.ts";
import {
  buildRegionTooltipDetails,
  regionTooltipTitle,
} from "@/lib/databases/map-tooltip.ts";
import { ensureLocalMaplibreWorker } from "@/lib/maps/maplibre-worker.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

ensureLocalMaplibreWorker();

/**
 * @fileoverview The MapLibre half of the map saved view. This module is loaded with a
 * dynamic `import()` from `database-map-view.tsx` and never imported
 * statically, so `maplibre-gl` (~275 KB gzipped, and it touches browser
 * globals at import time) stays out of the server graph and out of every page
 * that has no map on it — the same client-only seam `page-canvas.tsx` uses for
 * the canvas editor.
 *
 * Everything here is presentational: rows have already been filtered, sorted
 * and projected to geometry by `lib/databases/map-data.ts`.
 */

/**
 * Marker dot colors for select options. Literal class strings (not built from
 * the option id) so Tailwind's JIT actually emits them. These use the
 * saturated `--block-text-*` tokens rather than the pale `--block-bg-*` ones —
 * a 12px dot needs the stronger value to read against tiles.
 */
const MARKER_COLOR_CLASS: Record<BlockColor, string> = {
  blue: "bg-(--block-text-blue)",
  brown: "bg-(--block-text-brown)",
  gray: "bg-(--block-text-gray)",
  green: "bg-(--block-text-green)",
  orange: "bg-(--block-text-orange)",
  pink: "bg-(--block-text-pink)",
  purple: "bg-(--block-text-purple)",
  red: "bg-(--block-text-red)",
  yellow: "bg-(--block-text-yellow)",
};

/** Opacity per choropleth bucket, palest first. */
const REGION_BUCKET_OPACITY = [0.16, 0.32, 0.48, 0.66, 0.85];

/** Regions the rows say nothing about — visible as land, clearly not data. */
const REGION_EMPTY_OPACITY = 0.05;

/** Whole-world framing for the choropleth. */
const WORLD_CENTER: [number, number] = [8, 22];
const WORLD_ZOOM = 0.7;

/** Fallback when the palette token can't be read (SSR, detached node). */
const FALLBACK_ACCENT = "rgb(96, 133, 235)";

export interface DatabaseMapCanvasCommonProps {
  /** Height utility class applied to the map frame. */
  heightClass: string;
  showTooltip: boolean;
  theme: "dark" | "light";
}

/**
 * Resolve `var(--chart-N)` against the active palette scope. Returns
 * `rgb(r, g, b)` strings — MapLibre's style parser predates CSS Color 4 and
 * would choke on the raw `oklch()` the tokens are authored in.
 */
function usePaletteColors(count: number): {
  colors: string[];
  scopeRef: React.RefObject<HTMLDivElement | null>;
} {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const [colors, setColors] = useState<string[]>([]);

  useEffect(() => {
    const element = scopeRef.current;
    if (!element) {
      return;
    }
    const resolved: string[] = [];
    for (let index = 1; index <= count; index += 1) {
      const rgb = cssColorToRgb(element, `var(--chart-${index})`);
      resolved.push(
        rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : FALLBACK_ACCENT
      );
    }
    setColors(resolved);
  }, [count]);

  return { colors, scopeRef };
}

function MapFrame({
  children,
  className,
  scopeRef,
}: {
  children: ReactNode;
  className: string;
  scopeRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border",
        className
      )}
      // MapLibre reads its own drags; the page canvas must not claim them.
      data-canvas-pointer-surface=""
      // Reveals the overlay controls, like the page cover's toolbar.
      data-reveal-group=""
      ref={scopeRef}
    >
      {children}
    </div>
  );
}

/**
 * Neutralizes mapcn's built-in tooltip chip (dark fill, inverted text, its own
 * padding and shadow) so {@link MapMarkerCard} is the only surface; the
 * wrapper's fade-in animation is kept.
 */
const MARKER_TOOLTIP_RESET_CLASS =
  "border-0 bg-transparent p-0 text-popover-foreground shadow-none";

export interface DatabaseMapPointsCanvasProps
  extends DatabaseMapCanvasCommonProps {
  /** Bounding box of the points, used when no viewport is saved. */
  bounds: MapBounds | null;
  /** Cluster dense points instead of drawing one marker each. */
  clustered: boolean;
  onSelectRow: (rowId: string) => void;
  /** Select option id → palette color, for tinting markers. */
  optionColors: Record<string, BlockColor | undefined>;
  points: MapPoint[];
  /** Row glyph in the tooltip header, matching the grid's page-icon toggle. */
  showTooltipIcon: boolean;
}

/** Padding around a fitted bounding box, in pixels. */
const FIT_PADDING = 48;

/** Camera for a single point — a bbox of one would zoom to the maximum. */
const SINGLE_POINT_ZOOM = 11;

/** Initial camera: fit the plotted points, or fall back to a world view. */
function cameraProps(bounds: MapBounds | null) {
  if (!bounds) {
    return { center: [0, 20] as [number, number], zoom: 1 };
  }
  const [[west, south], [east, north]] = bounds;
  if (west === east && south === north) {
    return {
      center: [west, south] as [number, number],
      zoom: SINGLE_POINT_ZOOM,
    };
  }
  return { bounds, fitBoundsOptions: { padding: FIT_PADDING } };
}

export function DatabaseMapPointsCanvas({
  bounds,
  clustered,
  heightClass,
  onSelectRow,
  optionColors,
  points,
  showTooltip,
  showTooltipIcon,
  theme,
}: DatabaseMapPointsCanvasProps): ReactNode {
  const { colors, scopeRef } = usePaletteColors(MAP_REGION_BUCKET_COUNT);
  const accent = colors[0] ?? FALLBACK_ACCENT;

  const clusterData: FeatureCollection<Point, { rowId: string }> = {
    features: points.map((point) => ({
      geometry: { coordinates: [point.lng, point.lat], type: "Point" },
      properties: { rowId: point.rowId },
      type: "Feature",
    })),
    type: "FeatureCollection",
  };

  const handlePointClick = useCallback(
    (feature: { properties: { rowId: string } }) => {
      onSelectRow(feature.properties.rowId);
    },
    [onSelectRow]
  );

  return (
    <MapFrame className={heightClass} scopeRef={scopeRef}>
      <Map theme={theme} {...cameraProps(bounds)}>
        <MapOverlayControls showFullscreen />
        {clustered ? (
          <MapClusterLayer
            clusterColors={[
              colors[0] ?? FALLBACK_ACCENT,
              colors[2] ?? accent,
              colors[4] ?? accent,
            ]}
            data={clusterData}
            onPointClick={handlePointClick}
            pointColor={accent}
          />
        ) : (
          points.map((point) => (
            <MapMarker
              key={point.rowId}
              latitude={point.lat}
              longitude={point.lng}
              onClick={() => {
                onSelectRow(point.rowId);
              }}
            >
              <MarkerContent>
                <span
                  className={cn(
                    "block size-3 rounded-full border-2 border-background shadow-sm",
                    point.colorOptionId
                      ? (MARKER_COLOR_CLASS[
                          optionColors[point.colorOptionId] ?? "blue"
                        ] ?? "bg-primary")
                      : "bg-primary"
                  )}
                />
              </MarkerContent>
              {showTooltip ? (
                <MarkerTooltip className={MARKER_TOOLTIP_RESET_CLASS}>
                  <MapMarkerCard
                    details={point.details}
                    icon={point.icon}
                    label={point.label}
                    showIcon={showTooltipIcon}
                  />
                </MarkerTooltip>
              ) : null}
            </MapMarker>
          ))
        )}
      </Map>
    </MapFrame>
  );
}

/**
 * The hover payload mapcn hands `MapGeoJSON`: properties hang off `feature`,
 * and `originalEvent.point` is the cursor in canvas pixels — which is what
 * lets the card follow the pointer instead of sitting in a corner.
 */
interface RegionHoverEvent {
  feature: { properties: Record<string, unknown> | null };
  originalEvent: { point: { x: number; y: number } };
}

/** A region under the cursor, with where the cursor was and what to call it. */
interface HoveredRegion {
  flipX: boolean;
  flipY: boolean;
  point: { x: number; y: number };
  region: MapRegion;
  title: string;
}

/**
 * Card footprint used to decide which side of the cursor it opens on. Measuring
 * the real bounds would need a layout pass per hover; these track the card's
 * `max-w-64` and its tallest form (title + two rows), and erring large only
 * flips slightly earlier than strictly needed.
 */
const REGION_CARD_WIDTH_PX = 272;
const REGION_CARD_HEIGHT_PX = 88;

export interface DatabaseMapRegionCanvasProps
  extends DatabaseMapCanvasCommonProps {
  /** Region key → ramp bucket index (0 = palest). */
  buckets: Map<string, number>;
  /** True when the aggregate is a row count, which the card must not repeat. */
  isCountAggregate: boolean;
  /** GeoJSON feature property the region keys join against. */
  joinProperty: string;
  regions: MapRegion[];
  /** URL of the polygon source. */
  sourceUrl: string;
  /** Formatted "Count" / "Sum of Revenue" label for the hover readout. */
  valueLabel: string;
}

/**
 * Choropleth: one flat base color from the palette, stepped by opacity rather
 * than by hue. `--chart-1..5` is a categorical ramp in the colorful palette
 * (five different hues), which would read as five unrelated categories rather
 * than "more" and "less" — a sequential ramp has to come from one color.
 */
export function DatabaseMapRegionCanvas({
  buckets,
  heightClass,
  isCountAggregate,
  joinProperty,
  regions,
  showTooltip,
  sourceUrl,
  theme,
  valueLabel,
}: DatabaseMapRegionCanvasProps): ReactNode {
  const { colors, scopeRef } = usePaletteColors(1);
  const base = colors[0] ?? FALLBACK_ACCENT;
  const [hovered, setHovered] = useState<HoveredRegion | null>(null);

  // Plain records, not `new Map(...)`: mapcn's component is named `Map`, so
  // the global constructor is shadowed for the whole module.
  const byKey = useMemo(() => {
    const index: Record<string, MapRegion> = {};
    for (const region of regions) {
      index[region.key] = region;
    }
    return index;
  }, [regions]);

  const fillOpacity = useMemo(() => {
    // One `match` arm per opacity step: keys sharing a bucket share an arm, so
    // the expression stays a handful of entries rather than one per region.
    const keysByBucket: Record<number, string[]> = {};
    for (const [key, bucket] of buckets) {
      const list = keysByBucket[bucket];
      if (list) {
        list.push(key);
        continue;
      }
      keysByBucket[bucket] = [key];
    }
    const arms: unknown[] = [];
    for (const [bucket, keys] of Object.entries(keysByBucket)) {
      arms.push(
        keys,
        REGION_BUCKET_OPACITY[Number(bucket)] ?? REGION_EMPTY_OPACITY
      );
    }
    if (arms.length === 0) {
      return REGION_EMPTY_OPACITY;
    }
    // `upcase` mirrors `normalizeRegionKey` on the feature side of the join.
    return [
      "match",
      ["upcase", ["to-string", ["get", joinProperty]]],
      ...arms,
      REGION_EMPTY_OPACITY,
    ];
  }, [buckets, joinProperty]);

  const handleHover = useCallback(
    (event: RegionHoverEvent | null) => {
      if (!event) {
        setHovered(null);
        return;
      }
      const properties = event.feature.properties ?? {};
      const raw = properties[joinProperty];
      const region =
        typeof raw === "string" ? byKey[normalizeRegionKey(raw)] : undefined;
      if (!region) {
        setHovered(null);
        return;
      }
      const { point } = event.originalEvent;
      const frame = scopeRef.current;
      setHovered({
        flipX: frame
          ? point.x + REGION_CARD_WIDTH_PX > frame.clientWidth
          : false,
        flipY: frame
          ? point.y + REGION_CARD_HEIGHT_PX > frame.clientHeight
          : false,
        point,
        region,
        title: regionTooltipTitle(properties, region.label),
      });
    },
    [byKey, joinProperty, scopeRef]
  );

  return (
    <MapFrame className={heightClass} scopeRef={scopeRef}>
      <Map blank center={WORLD_CENTER} theme={theme} zoom={WORLD_ZOOM}>
        <MapGeoJSON
          data={sourceUrl}
          fillHoverPaint={{ "fill-opacity": 0.95 }}
          fillPaint={
            {
              "fill-color": base,
              "fill-opacity": fillOpacity,
            } as never
          }
          interactive={showTooltip}
          onHover={showTooltip ? (handleHover as never) : undefined}
          promoteId={joinProperty}
        />
        <MapOverlayControls />
      </Map>
      {hovered ? (
        <MapRegionCard
          details={buildRegionTooltipDetails(
            hovered.region,
            valueLabel,
            isCountAggregate
          )}
          flipX={hovered.flipX}
          flipY={hovered.flipY}
          point={hovered.point}
          title={hovered.title}
        />
      ) : null}
    </MapFrame>
  );
}
