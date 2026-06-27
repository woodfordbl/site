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

const ogHandler = fileURLToPath(
  new URL("./routes/api/og.get.ts", import.meta.url)
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
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    devtools(),
    // Register the dynamic OG endpoint as an explicit Nitro route so it is
    // bundled into the Vercel function output (filesystem scanning of root
    // `routes/` isn't wired in this TanStack Start dev integration).
    nitro({
      handlers: [{ route: "/api/og", method: "GET", handler: ogHandler }],
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
