/**
 * Client-only mapcn previews for the `/dev` showcase.
 *
 * This module is the only place the design system pulls in `@/components/ui/map`
 * (and through it `maplibre-gl`, which touches browser globals). It is loaded
 * with a dynamic `import()` from `component-showcase.tsx` so MapLibre never
 * enters the server graph — the same client-only seam `page-canvas.tsx` uses for
 * the canvas editor.
 */
import { Map, MapControls, MapGeoJSON } from "@/components/ui/map.tsx";
import { ensureLocalMaplibreWorker } from "@/lib/maps/maplibre-worker.ts";

ensureLocalMaplibreWorker();

type MapPreviewTheme = "light" | "dark";

/** Natural Earth 1:110m country polygons — the blank-canvas geography source. */
const WORLD_COUNTRIES_GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson/ne_110m_admin_0_countries.geojson";

/**
 * Default tiled basemap: streets, labels, and geographic context. Use this
 * whenever the map answers "where is this place".
 */
export function StreetMapPreview({ theme }: { theme: MapPreviewTheme }) {
  return (
    <div className="h-[320px] overflow-hidden rounded-lg border">
      <Map center={[-74.006, 40.7128]} theme={theme} zoom={11}>
        <MapControls showCompass showFullscreen />
      </Map>
    </div>
  );
}

/**
 * Blank canvas: no tiles, geography comes from the data. Use this for
 * choropleths, dot maps, and anything where the dataset defines the shapes.
 */
export function BlankMapPreview({ theme }: { theme: MapPreviewTheme }) {
  return (
    <div className="h-[320px] overflow-hidden rounded-lg border">
      <Map blank center={[8, 22]} theme={theme} zoom={0.6}>
        {/* ADM0_A3, not ISO_A3: Natural Earth stores `-99` in ISO_A3 for five
            features (France, Norway, Kosovo, N. Cyprus, Somaliland), while
            ADM0_A3 is unique across all 177. */}
        <MapGeoJSON data={WORLD_COUNTRIES_GEOJSON_URL} promoteId="ADM0_A3" />
        <MapControls />
      </Map>
    </div>
  );
}
