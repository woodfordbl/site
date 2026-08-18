import { setWorkerUrl } from "maplibre-gl";

/**
 * @fileoverview Point MapLibre's worker at our own bundle instead of the CDN.
 *
 * The mapcn registry component defaults the worker to
 * `https://unpkg.com/maplibre-gl@<version>/dist/maplibre-gl-worker.mjs`. That
 * makes every map depend on unpkg.com at runtime, and MapLibre parses GeoJSON
 * and vector tiles *in the worker* — so when unpkg is unreachable (an offline
 * client, a blocked network, unpkg having a bad day) the style never finishes
 * loading and GeoJSON layers silently render nothing. DOM markers still show,
 * which makes the failure look like a data bug rather than a network one.
 *
 * The worker is copied into `public/maplibre/` by
 * `scripts/sync-maplibre-worker.mjs` (wired into `pnpm sync`, which `dev` and
 * `build` both run) rather than imported with Vite's `?url`: the worker entry
 * does `import "./maplibre-gl-shared.mjs"`, and `?url` would emit the entry as
 * a lone hashed asset whose sibling import 404s in production.
 *
 * Call this at module scope in any module that renders a map, *after* the
 * import of `@/components/ui/map.tsx` has run: the registry sets its default
 * at import time behind a `getWorkerUrl()` guard, and module bodies evaluate
 * after all imports, so this override always lands before a map is created.
 */
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

let applied = false;

export function ensureLocalMaplibreWorker(): void {
  if (applied || typeof window === "undefined") {
    return;
  }
  applied = true;
  setWorkerUrl(MAPLIBRE_WORKER_URL);
}
