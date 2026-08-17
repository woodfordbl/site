# Maps

> **Status: steps 1–4 shipped.** The `map` view type (pins / cluster / region
> marks) and the standalone `map` block are implemented — see
> [databases — Map view](../architecture/databases.md#map-view) and
> [block-types — `map`](../architecture/block-types.md#map) for what the code
> actually does. This document is kept as the design record: the reasoning
> below is why it is shaped that way. Steps 5–6 (a `location` field type, the
> `arc` mark, geocoding) are still open, deliberately gated on what the shipped
> views teach.

Geography as a first-class way to look at workspace data: a **`map` database
view** that renders the rows a view already resolved as pins, clusters, regions
or arcs, and a small **`map` block** for putting a single place on a page.

[mapcn](https://mapcn.dev) is installed — this proposal is about what to build
on top of it, in what order, and the one modelling decision everything else
hangs off.

## What already landed

`npx shadcn@latest add @mapcn/map` wrote one registry component and some
MapLibre CSS overrides:

| Piece | Where | Notes |
|---|---|---|
| mapcn registry component | [`src/components/ui/map.tsx`](../../src/components/ui/map.tsx) | 2232 lines, upstream-verbatim. Exports `Map`, `MapMarker`, `MapPopup`, `MapControls`, `MapRoute`, `MapArc`, `MapGeoJSON`, `MapClusterLayer`, `useMap` |
| Registry source | `components.json` | `"@mapcn": "https://mapcn.dev/r/{name}.json"` — further blocks install with `npx shadcn@latest add @mapcn/<name>` |
| MapLibre chrome overrides | [`src/styles.css`](../../src/styles.css) | Popup/tip/attribution restyled onto our tokens |
| Dependencies | `package.json` | `maplibre-gl@^6`, `@types/geojson` |
| Preview | [`map-preview.tsx`](../../src/components/dev/map-preview.tsx), `MapsSection` in [`component-showcase.tsx`](../../src/components/dev/component-showcase.tsx) | `/dev` → **Maps**: tiled basemap and blank-canvas-plus-countries side by side |

Lint treats `ui/map.tsx` the way it treats the vendored dither-kit — formatter,
linter and assist off in `biome.jsonc` — so re-running the CLI stays a clean
diff instead of a 205-error reformat.

## The one decision: where do coordinates come from

[`databaseFieldTypeSchema`](../../src/lib/schemas/database.ts) is
`text | number | checkbox | select | multiSelect | date | url | formula |
relation`. There is no location type, and every map feature is blocked on that
gap. Three ways out:

| Option | Cost | Problem |
|---|---|---|
| **A. Derive from existing fields** — the view config names a lat field + lng field, or one text field holding `"37.77, -122.41"`, or a code field joined to GeoJSON | View config only. Zero schema change, zero migration | Coordinates aren't validated at write time; a typo shows up as a missing pin |
| **B. New `location` field type** — cell stores `{ lng, lat, label? }` | Field def, cell renderer, cell editor, filter operators, sort, `cellToPlainText`, formula projection, connector `sourceKey`, Calculate-row behavior, history capture | Weeks of surface area before a single pin renders |
| **C. Formula-derived point** — a formula field returning a coordinate | Needs a point type in the formula language first | Blocked on [formula v2 follow-ons](./formula-language-v2.md) |

**Recommend A first, B once the view has earned it.** Rows arrive in this app
by CSV paste, connector sync and hand entry, and in all three cases latitude and
longitude are already sitting in two number columns. Option A reads that data on
day one; option B makes every existing table re-key its data before it can see a
map. Nothing in A blocks B later — a `location` field becomes one more source
the same view config can point at.

## Idea 1 — a `map` database view (recommended)

Not four view types. **One `map` view with a `mark` switch**, exactly the shape
[`chart`](../../src/components/database/views/database-chart-view.tsx) already
uses (`mark: line | bar | area | pie`). The view body receives the shared
`{ database, view, fields, rows, mode }` contract with rows already filtered,
sorted and formula-merged, so filters, sorts and the filter bar work on a map
for free, on day one, with no new code.

| Mark | Basemap | Geometry source | Reads well for |
|---|---|---|---|
| `pins` | tiled | lat/lng per row → `MapMarker` | Stores, sites, visits, addresses — anything under ~500 rows |
| `cluster` | tiled | same, via `MapClusterLayer` | The same data at thousands of rows |
| `region` | `blank` + `MapGeoJSON` | join a code field to a feature property, aggregate a numeric field | Choropleths — count/sum/avg by country or region |
| `arc` | `blank` or tiled | two coordinate pairs per row → `MapArc` | Origin→destination: shipments, flows, travel |

Config, keyed under `view.config.map` beside `board` and `chart`:

```ts
map: {
  mark: "pins" | "cluster" | "region" | "arc",       // default "pins"
  // pins / cluster / arc
  latFieldId?: string,
  lngFieldId?: string,
  coordFieldId?: string,        // one text field: "lat, lng"
  labelFieldId?: string,        // defaults to the primary field
  colorFieldId?: string,        // a select field — option colors become pin colors
  // region
  joinFieldId?: string,         // row-side code (select or text)
  joinProperty?: string,        // feature-side property, default "ADM0_A3"
  valueFieldId?: string,
  valueAggregate?: DatabaseChartYAggregate,   // reuse count/sum/average/min/max
  scale?: "linear" | "quantile",
  // shared
  viewport?: { center: [number, number], zoom: number },   // "save current view"
}
```

Two reuse notes that make this much smaller than it looks:

- **`valueAggregate` is already a shared enum.**
  `DATABASE_CHART_Y_AGGREGATES` in
  [`database.ts`](../../src/lib/schemas/database.ts) is documented as the single
  source for both the schema and the settings menu's option list. A choropleth
  is a bar chart whose x-axis is a country, so it should read from the same
  taxonomy and the same config menu components.
- **Color comes from the existing palettes.** `region` fills should ramp over
  `--chart-1`…`--chart-5` via [`chart-palettes.ts`](../../src/lib/charts/chart-palettes.ts)
  so a map inherits the Settings → Analytics palette like every chart does, and
  `colorFieldId` should reuse select-option colors the way the board view does.
  mapcn's `MapGeoJSON` defaults are hardcoded neutral hexes — override
  `fillPaint` rather than adopting them.

### Where the pure logic goes

`src/lib/databases/map-data.ts`, mirroring
[`chart-data.ts`](../../src/lib/databases/chart-data.ts): React-free,
`rows + fields + config → GeoJSON FeatureCollection`, plus coordinate parsing
and the region join. That is the part worth unit tests — bad latitudes, swapped
lat/lng, unmatched join keys, empty cells.

### Touch points

Adding a view type is a known, bounded edit — `chart` is the worked example:

| File | Change |
|---|---|
| [`schemas/database.ts`](../../src/lib/schemas/database.ts) | `"map"` in `databaseViewTypeSchema`; `map` object in `databaseTableViewConfigSchema` |
| [`database-collection-ops.ts`](../../src/db/queries/database-collection-ops.ts) | `defaultViewConfig` case, `VIEW_TYPE_DEFAULT_NAMES` entry |
| [`database-view-switcher.tsx`](../../src/components/database/database-view-switcher.tsx) | `VIEW_TYPES` array (drives the "+" add-view menu) |
| [`database-view-icons.tsx`](../../src/components/database/database-view-icons.tsx) | Type glyph (`IconMapPin`) |
| [`database-table-view.tsx`](../../src/components/database/database-table-view.tsx) | Per-type body dispatch |
| [`database-settings-menu.tsx`](../../src/components/database/database-settings-menu.tsx) | View settings section |
| `views/database-map-view.tsx`, `views/database-map-config.tsx` | New — mirror the chart pair |
| `lib/databases/map-data.ts` | New — pure projection + tests |

`defaultViewConfig` should pick sensibly on creation the way chart does: two
number fields named lat/latitude and lng/lon/longitude → `pins`; otherwise a
select field that looks like country codes → `region`; otherwise `pins`
unconfigured with an empty-state prompt.

### Interactions worth getting right

- **Click a pin → open the row.** `ensureDatabaseRowPage` from
  [`materialize-row-page.ts`](../../src/lib/databases/materialize-row-page.ts)
  is the same call the grid row menu makes; the map should not invent its own.
- **Hover → `MapPopup`** with the primary field and whichever fields
  `visibleFieldIds` already exposes.
- **Rows with no coordinates** get a footer count ("12 rows not on the map"),
  matching how `HiddenRowsNotice` reports filtered-away rows.
- **Viewport is view state, not session state.** A saved "save current view"
  viewport belongs in `view.config.map.viewport`; incidental panning should not
  write to the document on every frame.

## Idea 2 — a `map` block for a single place

The linked-database case needs **no new block**. The `database` block already
holds `{ databaseId, viewId }`, so the moment `map` is a view type,
`/database` + a map view puts a data map on any page, with linked views on
several pages pointing at one database.

What that leaves is the standalone case — a page about a place that wants a map
of that place, with no database behind it. That is a leaf block shaped almost
exactly like `embed`:

```ts
// mapPropsSchema
{
  center: [number, number],
  zoom: number,
  basemap?: "streets" | "blank",       // default "streets"
  markers?: { lng: number, lat: number, label?: string }[],
  height?: number,                     // default ~320
  caption?: string,
  showCaption?: boolean,
}
```

Per the [Adding a block type](../architecture/block-types.md#adding-a-block-type)
checklist that is three edits — props schema + `blockSchema` union entry,
`BLOCK_DEFS` entry (`isEmpty` = no center set), and a
`types/map/map-view.tsx` / `map-edit.tsx` pair plus a `BLOCK_SPECS` entry —
with `editStrategy: "inline-custom"`, the same strategy `embed` and `database`
use. No reducer changes, no container config.

The empty state is the interesting part, because **there is no geocoder**. This
app has no backend, and address search would mean a new Nitro proxy plus a
keyed third-party service that 503s without its key. The v1 picker should
therefore be: paste `lat, lng`, or drop a pin by clicking the map, then "use
current view" to freeze center and zoom. Geocoding can arrive later as an
optional proxy alongside the Unsplash and Finnhub ones, degrading to
coordinate entry when the key is absent.

A third surface falls out for free once the block exists: a row page whose
database has coordinates could render the same block above its Properties
section.

## What not to build

- **Do not ship the mapcn blocks as-is.** `@mapcn/analytics-map`,
  `@mapcn/choropleth` and `@mapcn/store-locator` are opinionated demo
  compositions with their own cards, legends and filter chrome. Ours has to live
  inside the database view shell and inherit our filter bar, palette, tokens and
  row-open behavior. Install them into a scratch directory to read how they wire
  the primitives; ship views built on `MapGeoJSON` / `MapClusterLayer` /
  `MapMarker` / `MapArc` directly.
- **Do not teach the `embed` block to recognize map URLs.** An iframed
  third-party map cannot be themed, cannot open a row, and cannot read a filter.
- **Do not add `arc` in v1.** It needs two coordinate pairs per row, which
  almost no real table has until relations get involved. It is a mark to add
  once `pins` and `region` are carrying weight.

## Cross-cutting constraints

**Bundle.** `maplibre-gl@6` is ~275 KB gzipped (142 KB main + 134 KB shared) —
in shiki's league, and shiki is already lazy-loaded. Maps must be a lazy chunk
loaded only when a map view or block actually renders, never in the SSR graph.
`map-preview.tsx` establishes the seam: a separate module pulled in with a
dynamic `import()` from a `useEffect`, the same pattern
[`page-canvas.tsx`](../../src/components/canvas/page-canvas.tsx) uses for the
editor. A map view mounting must not slow down a page whose other views are
tables.

**Theme.** `Map` takes `theme?: "light" | "dark"` and otherwise sniffs the
document. Wire it to our theme explicitly rather than letting it guess, so
toggling dark mode repaints tiles in the same frame as the rest of the page.

**Offline.** The app is fully local-first, but tiles are not. A tiled basemap is
blank without network — which argues for `region` marks over `pins` wherever
either would do, and for **vendoring the country GeoJSON into `public/geo/`**
rather than hotlinking jsDelivr: 839 KB raw, 210 KB gzipped, 177 features,
served from our own origin and working offline. (Verified: promote `ADM0_A3`,
not `ISO_A3` — Natural Earth stores `-99` in `ISO_A3` for France, Norway,
Kosovo, N. Cyprus and Somaliland, while `ADM0_A3` is unique across all 177.)

**Attribution.** CARTO basemap tiles require visible attribution. The installed
CSS already restyles `.maplibregl-ctrl-attrib` onto our tokens — it must not be
hidden to make a block look cleaner.

## What shipping it changed

Three things the design above did not anticipate, recorded because they cost
real debugging time:

- **MapLibre's worker was pointed at unpkg.com** by the registry component.
  MapLibre parses GeoJSON *in the worker*, so with unpkg unreachable the style
  never finishes loading and every GeoJSON layer renders nothing — while DOM
  markers keep working, which makes it look like a data bug. Fixed by copying
  the worker into `public/maplibre/` (`scripts/sync-maplibre-worker.mjs`); a
  Vite `?url` import is not enough, because the worker entry imports a sibling
  chunk that `?url` does not emit.
- **A sequential ramp cannot come from `--chart-1..5`.** Those tokens are
  categorical in the colorful palette. The choropleth uses one base color
  stepped by opacity instead.
- **`Map` is the name of the mapcn component**, so inside any module that
  imports it `new Map()` resolves to a React component rather than the global.
  Region lookups use plain records.

## Sequencing

1. ~~**`map` view, `pins` mark, option A coordinates.**~~ **Shipped.** The
   view-type scaffold plus `map-data.ts`. Filters and sorts came free.
2. ~~**`region` mark**~~ **Shipped**, with vendored country GeoJSON and the
   shared aggregate enum. Highest visual payoff per line of code, as expected.
3. ~~**`cluster` mark**~~ **Shipped** — one component swap behind the mark
   toggle.
4. ~~**`map` block** for standalone places~~ **Shipped**, with click-to-place
   and paste-coords.
5. **`location` field type** (option B), once the view has proven which of
   validation, geocoding or map-click entry people actually miss.
6. **`arc` mark**, and optional geocoding via a Nitro proxy.
