import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
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
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
