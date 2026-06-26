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
import {
  SyncSiteAppearanceCookieEffect,
  ThemeProvider,
} from "@/components/layout/theme-provider.tsx";
import { NotFoundPage } from "@/components/ui/not-found-page.tsx";
import { AppProviders } from "@/db/provider.tsx";
import { loadSiteAppearance } from "@/lib/appearance/load-site-appearance.ts";
import { buildNotFoundMeta } from "@/lib/content/page-head.ts";
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
    const [localPagePreview, sidebarPrefs, deviceLayoutHints, siteAppearance] =
      await Promise.all([
        loadPageListLocalPreview(),
        loadPageSidebarPrefs(),
        loadDeviceLayoutHints(),
        loadSiteAppearance(),
      ]);
    return {
      deviceLayoutHints,
      localPagePreview,
      sidebarPrefs,
      siteAppearance,
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
  head: ({ matches }) => {
    const isNotFound = matches.some((match) => match.status === "notFound");

    return {
      meta: isNotFound
        ? [
            {
              charSet: "utf-8",
            },
            {
              name: "viewport",
              content: "width=device-width, initial-scale=1",
            },
            ...buildNotFoundMeta(),
          ]
        : [
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
    };
  },
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { deviceLayoutHints, siteAppearance } = useRouteContext({
    from: "__root__",
  });

  return (
    <html
      className={siteAppearance.resolvedTheme === "dark" ? "dark" : undefined}
      lang="en"
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider initialHints={siteAppearance}>
          <DeviceLayoutProvider initialHints={deviceLayoutHints}>
            <AppProviders>{children}</AppProviders>
            <SyncDeviceLayoutCookieEffect />
            <SyncSiteAppearanceCookieEffect />
          </DeviceLayoutProvider>
        </ThemeProvider>
        {AppDevtools ? <AppDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
