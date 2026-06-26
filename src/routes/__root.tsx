import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { lazy } from "react";
import {
  DeviceLayoutProvider,
  SyncDeviceLayoutCookieEffect,
} from "@/components/layout/device-layout-provider.tsx";
import { AppProviders } from "@/db/provider.tsx";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { computePagesCatalogRevision } from "@/lib/content/pages-catalog-revision.ts";
import { loadDeviceLayoutHints } from "@/lib/device/load-device-layout-hints.ts";
import { getSidebarTablerGlyphs } from "@/lib/pages/get-sidebar-tabler-glyphs.ts";
import { loadPageListLocalPreview } from "@/lib/pages/load-page-list-local-preview.ts";
import { loadPageSidebarPrefs } from "@/lib/pages/load-page-sidebar-prefs.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import { tablerIconNamesForSSR } from "@/lib/pages/tabler-icon-names-from-pages.ts";
import type { RouterContext } from "@/router-context.ts";

import appCss from "../styles.css?url";

const AppDevtools = import.meta.env.DEV
  ? lazy(() =>
      import("@/components/dev/app-devtools.tsx").then((module) => ({
        default: module.AppDevtools,
      }))
    )
  : null;

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const [localPagePreview, sidebarPrefs, deviceLayoutHints] =
      await Promise.all([
        loadPageListLocalPreview(),
        loadPageSidebarPrefs(),
        loadDeviceLayoutHints(),
      ]);
    return {
      deviceLayoutHints,
      localPagePreview,
      sidebarPrefs,
    };
  },
  loader: async ({ context }) => {
    const pages =
      await context.queryClient.ensureQueryData(pageListQueryOptions);
    const mergedPages = mergePageList(pages, context.localPagePreview);
    const sidebarTablerGlyphs = await getSidebarTablerGlyphs({
      data: tablerIconNamesForSSR(mergedPages),
    });

    return {
      pagesCatalogRevision: computePagesCatalogRevision(pages),
      serverPages: pages,
      sidebarTablerGlyphs,
    };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Blake Woodford",
      },
      {
        name: "theme-color",
        content: "#0a0a0a",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "any",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { deviceLayoutHints } = useRouteContext({ from: "__root__" });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <DeviceLayoutProvider initialHints={deviceLayoutHints}>
          <AppProviders>{children}</AppProviders>
          <SyncDeviceLayoutCookieEffect />
        </DeviceLayoutProvider>
        {AppDevtools ? <AppDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
