import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copy MapLibre's worker bundle into `public/maplibre/`.
 *
 * The mapcn registry component points the worker at unpkg.com by default,
 * which makes every map depend on a third-party CDN at runtime — and because
 * MapLibre parses GeoJSON and vector tiles *in the worker*, an unreachable
 * unpkg means layers silently render nothing.
 *
 * This has to be a public/ copy rather than a Vite `?url` import: the worker
 * entry does `import "./maplibre-gl-shared.mjs"`, and `?url` emits the entry
 * as a lone hashed asset without its sibling, so the relative import 404s in a
 * production build. Copying both files keeps them adjacent, and copying from
 * node_modules keeps the worker on the same version as the installed package.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sourceDir = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const targetDir = join(root, "public/maplibre");

const files = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(targetDir, { recursive: true });

for (const file of files) {
  await cp(join(sourceDir, file), join(targetDir, file));
}

console.log(`sync-maplibre: copied ${files.join(", ")} → public/maplibre/`);
