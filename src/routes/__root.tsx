import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { lazy } from "react";
import { GlobalCommandHotkeys } from "@/components/keyboard/global-command-hotkeys.tsx";
import {
  DeviceLayoutProvider,
  SyncDeviceLayoutCookieEffect,
} from "@/components/layout/device-layout-provider.tsx";
import { HapticsProvider } from "@/components/layout/haptics-provider.tsx";
import {
  SyncSiteAppearanceCookieEffect,
  THEME_COLOR_BY_APPEARANCE,
  ThemeProvider,
} from "@/components/layout/theme-provider.tsx";
import { TemplatePageProvider } from "@/components/pages/template-page-provider.tsx";
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
import { loadTemplatePageId } from "@/lib/pages/load-template-page.ts";
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
    const [
      localPagePreview,
      sidebarPrefs,
      deviceLayoutHints,
      siteAppearance,
      templatePageId,
    ] = await Promise.all([
      loadPageListLocalPreview(),
      loadPageSidebarPrefs(),
      loadDeviceLayoutHints(),
      loadSiteAppearance(),
      loadTemplatePageId(),
    ]);
    return {
      deviceLayoutHints,
      localPagePreview,
      sidebarPrefs,
      siteAppearance,
      templatePageId,
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

    const baseMeta = [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
      },
    ];

    return {
      meta: isNotFound
        ? [...baseMeta, ...buildNotFoundMeta()]
        : [
            ...baseMeta,
            {
              title: "Blake Woodford",
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
    };
  },
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { deviceLayoutHints, siteAppearance, templatePageId } = useRouteContext(
    {
      from: "__root__",
    }
  );
  const isDark = siteAppearance.resolvedTheme === "dark";

  return (
    <html
      className={isDark ? "dark" : undefined}
      data-chart-palette={siteAppearance.appearance.chartPalette}
      data-page-text-scale={siteAppearance.appearance.textScale}
      lang="en"
    >
      <head>
        <HeadContent />
        {/* iOS Safari tints its top bar from `theme-color`. For the "system"
            preference, ship BOTH variants with a `prefers-color-scheme` media
            query so the browser picks the right one natively at load — SSR can't
            know the device's system appearance, and iOS does not reliably re-read
            a JS-updated `theme-color`, so a single SSR meta would pin the bar to
            the wrong (light) tint in system-dark. For an explicit light/dark
            preference, a single meta matching the resolved theme is correct. */}
        {siteAppearance.appearance.theme === "system" ? (
          <>
            <meta
              content={THEME_COLOR_BY_APPEARANCE.light}
              media="(prefers-color-scheme: light)"
              name="theme-color"
            />
            <meta
              content={THEME_COLOR_BY_APPEARANCE.dark}
              media="(prefers-color-scheme: dark)"
              name="theme-color"
            />
          </>
        ) : (
          <meta
            content={THEME_COLOR_BY_APPEARANCE[siteAppearance.resolvedTheme]}
            name="theme-color"
          />
        )}
      </head>
      <body>
        <ThemeProvider initialHints={siteAppearance}>
          <DeviceLayoutProvider initialHints={deviceLayoutHints}>
            <HapticsProvider>
              <HotkeysProvider>
                <AppProviders>
                  <TemplatePageProvider initialTemplatePageId={templatePageId}>
                    <GlobalCommandHotkeys />
                    {children}
                  </TemplatePageProvider>
                </AppProviders>
              </HotkeysProvider>
              <SyncDeviceLayoutCookieEffect />
              <SyncSiteAppearanceCookieEffect />
            </HapticsProvider>
          </DeviceLayoutProvider>
        </ThemeProvider>
        {AppDevtools ? <AppDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
