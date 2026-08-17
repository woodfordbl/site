import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import type { NitroModule } from "nitro/types";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { resolveSiteOrigin } from "./scripts/resolve-origin.mjs";

// Bake the canonical origin in at build time so canonical links and OG image
// URLs render identically on the server and client. Falls back to localhost
// for plain local dev (no Vercel / SITE_ORIGIN env).
const SITE_ORIGIN = resolveSiteOrigin() ?? "http://localhost:3000";

// Deployment environment, baked in for env-tinted favicons (see
// scripts/generate-icons.mjs). Vercel sets VERCEL_ENV to "production" |
// "preview" | "development"; plain local runs fall back to "development".
const DEPLOY_ENV = process.env.VERCEL_ENV || "development";

// Whether the /dev routes (component showcase, canvas fixture, OG playground)
// are reachable: everywhere except production, so a branch can be reviewed on
// its Vercel preview against a real production build.
//
// This is a `define` rather than a helper module export on purpose. Each route
// gates its `lazy(() => import(…))` on this value, and only a literal
// substituted into the route module itself folds at build time — an imported
// const does not propagate, and Rollup then emits the dev-only chunks
// (component-showcase, MapLibre, og-playground) into the production bundle as
// dead weight.
const DEV_ROUTES_ENABLED = DEPLOY_ENV !== "production";

// The devtools plugin injects a client that holds an SSE console pipe open for
// the life of the tab. A signed-in dev session already parks one long-poll per
// live shape (pages, blocks, databases, database_rows, my_access), and browsers
// allow ~6 connections per origin over HTTP/1.1 — so the pipe takes the last
// slot and the next module request never gets one, leaving a blank page that
// never finishes booting. Off by default for that reason; VITE_DEVTOOLS=1
// restores it, which is safe for anonymous local-mode work (no shapes).
const DEVTOOLS_ENABLED = process.env.VITE_DEVTOOLS === "1";

const ogHandler = fileURLToPath(
  new URL("./routes/api/og.get.ts", import.meta.url)
);

const geocodeHandler = fileURLToPath(
  new URL("./routes/api/geocode.get.ts", import.meta.url)
);

const unsplashSearchHandler = fileURLToPath(
  new URL("./routes/api/unsplash/search.get.ts", import.meta.url)
);

const unsplashDownloadHandler = fileURLToPath(
  new URL("./routes/api/unsplash/download.post.ts", import.meta.url)
);

const finnhubQuoteHandler = fileURLToPath(
  new URL("./routes/api/connectors/finnhub/quote.get.ts", import.meta.url)
);

const finnhubStreamHandler = fileURLToPath(
  new URL("./routes/api/connectors/finnhub/stream.ts", import.meta.url)
);

const yahooChartHandler = fileURLToPath(
  new URL("./routes/api/connectors/yahoo/chart.get.ts", import.meta.url)
);

const authHandler = fileURLToPath(
  new URL("./routes/api/auth/all.ts", import.meta.url)
);

const shapeHandler = fileURLToPath(
  new URL("./routes/api/sync/shape.get.ts", import.meta.url)
);

const mutateHandler = fileURLToPath(
  new URL("./routes/api/sync/mutate.post.ts", import.meta.url)
);

const pagePermissionsHandler = fileURLToPath(
  new URL("./routes/api/pages/permissions.post.ts", import.meta.url)
);

/**
 * Nitro module that re-adds `continue: true` to header-only routes in the
 * generated Vercel Build Output config once the preset has written it. Without
 * it, a matched header route (e.g. the asset cache-control rule) halts routing
 * before the filesystem handler and the request falls through to the SSR
 * function, which serves the wrong MIME type for static JS/CSS chunks. See the
 * `nitro()` call below for the full explanation.
 */
const vercelAssetRouteFixModule: NitroModule = {
  name: "vercel-asset-route-continue-fix",
  setup(nitroInstance) {
    nitroInstance.hooks.hook("compiled", () => {
      if (nitroInstance.options.preset !== "vercel") {
        return;
      }
      patchVercelAssetRoutes(
        resolve(nitroInstance.options.output.dir, "config.json")
      );
    });
  },
};

/**
 * Ensure header-only routes in the generated Vercel Build Output config carry
 * `continue: true`, so asset requests fall through to the static filesystem
 * handler instead of the SSR function.
 */
function patchVercelAssetRoutes(configPath: string): void {
  if (!existsSync(configPath)) {
    return;
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (!Array.isArray(config.routes)) {
    return;
  }
  let changed = false;
  for (const route of config.routes) {
    const isHeaderOnly =
      route &&
      typeof route === "object" &&
      route.headers &&
      route.src &&
      !(route.dest || route.handle || route.status) &&
      route.continue !== true;
    if (isHeaderOnly) {
      route.continue = true;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  }
}

const config = defineConfig({
  define: {
    "import.meta.env.VITE_SITE_ORIGIN": JSON.stringify(SITE_ORIGIN),
    "import.meta.env.VITE_DEPLOY_ENV": JSON.stringify(DEPLOY_ENV),
    "import.meta.env.VITE_DEV_ROUTES_ENABLED":
      JSON.stringify(DEV_ROUTES_ENABLED),
  },
  server: {
    // Honor an externally-assigned port (e.g. a preview harness sets PORT);
    // otherwise default to 3000. Vite auto-increments if the port is taken.
    port: Number(process.env.PORT) || 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    ...(DEVTOOLS_ENABLED ? [devtools()] : []),
    // Register the dynamic OG endpoint as an explicit Nitro route so it is
    // bundled into the Vercel function output (filesystem scanning of root
    // `routes/` isn't wired in this TanStack Start dev integration).
    nitro({
      // Enable Nitro's native WebSocket support (crossws) for the Finnhub
      // stream proxy route below. Same-origin `wss://…/api/connectors/finnhub/
      // stream` relays Finnhub's real-time feed with the server-side key.
      // Skipped under Vitest: Nitro's dev-server WS hook dereferences the (null)
      // http server in the test runner, and tests don't exercise the socket.
      features: { websocket: !process.env.VITEST },
      handlers: [
        { route: "/api/og", method: "GET", handler: ogHandler },
        { route: "/api/geocode", method: "GET", handler: geocodeHandler },
        {
          route: "/api/unsplash/search",
          method: "GET",
          handler: unsplashSearchHandler,
        },
        {
          route: "/api/unsplash/download",
          method: "POST",
          handler: unsplashDownloadHandler,
        },
        {
          route: "/api/connectors/finnhub/quote",
          method: "GET",
          handler: finnhubQuoteHandler,
        },
        // WebSocket upgrade route (no HTTP method); the handler default-exports
        // `defineWebSocketHandler`, which Nitro wires to the crossws upgrade.
        {
          route: "/api/connectors/finnhub/stream",
          handler: finnhubStreamHandler,
        },
        {
          route: "/api/connectors/yahoo/chart",
          method: "GET",
          handler: yahooChartHandler,
        },
        // Better Auth's HTTP surface (all methods, catch-all).
        { route: "/api/auth/**", handler: authHandler },
        // Sync engine: Electric-protocol shape reads + transactional writes.
        { route: "/api/sync/shape", method: "GET", handler: shapeHandler },
        { route: "/api/sync/mutate", method: "POST", handler: mutateHandler },
        // ReBAC share-dialog actions (grants, visibility, inheritance).
        {
          route: "/api/pages/permissions",
          method: "POST",
          handler: pagePermissionsHandler,
        },
      ],
      // Workaround for a Nitro bug on the Vercel preset. Nitro's Vite plugin
      // auto-adds a `routeRules["/assets/**"]` cache-control header, but the
      // Vercel preset emits header-only route rules as Build Output API routes
      // *without* `continue: true`. Such a route matches `/assets/*.js`,
      // applies the header, then stops before `{ handle: "filesystem" }`, so
      // the static chunk is never served — the request falls through to the
      // SSR function and returns `text/html`. The browser then rejects the
      // module script with "'text/html' is not a valid JavaScript MIME type".
      // Registered as a module so it *appends* to the preset's `compiled` hook
      // (which writes config.json) rather than replacing it.
      modules: [vercelAssetRouteFixModule],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
