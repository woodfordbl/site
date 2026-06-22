import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy } from "react";

import { AppProviders } from "@/db/provider.tsx";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import { getPagesCatalogRevision } from "@/lib/content/page-store.server.ts";
import { getSidebarTablerGlyphs } from "@/lib/pages/get-sidebar-tabler-glyphs.ts";
import { loadPageListLocalPreview } from "@/lib/pages/load-page-list-local-preview.ts";
import { loadPageSidebarPrefs } from "@/lib/pages/load-page-sidebar-prefs.ts";
import { mergePageList } from "@/lib/pages/merge-page-list.ts";
import { tablerIconNamesFromPages } from "@/lib/pages/tabler-icon-names-from-pages.ts";
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
    const [localPagePreview, sidebarPrefs] = await Promise.all([
      loadPageListLocalPreview(),
      loadPageSidebarPrefs(),
    ]);
    return {
      localPagePreview,
      sidebarPrefs,
    };
  },
  loader: async ({ context }) => {
    const pages =
      await context.queryClient.ensureQueryData(pageListQueryOptions);
    const mergedPages = mergePageList(pages, context.localPagePreview);
    const sidebarTablerGlyphs = await getSidebarTablerGlyphs({
      data: tablerIconNamesFromPages(mergedPages),
    });

    return {
      pagesCatalogRevision: getPagesCatalogRevision(),
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
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
        {AppDevtools ? <AppDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
