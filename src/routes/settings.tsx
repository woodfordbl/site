/**
 * @fileoverview `/settings` layout route — site-wide preferences inside the
 * normal app shell (`SiteSettingsLayout` reuses the pages' resizable sidebar
 * chrome; only the sidebar slot and main inset differ). Search params:
 * `returnTo` (pathname for "Back to app") and `pageId` (target for
 * development actions). The Development section is shown only while
 * `usePageCanvasFooterActions` reports visible and is compile-time relabeled
 * "Local changes" in production (`site-settings-sections.ts`) since visitors
 * see it too. The global text-size default lives in the Appearance section;
 * pages inherit it unless `PageHeaderMenu` sets a per-page override.
 */
import { createFileRoute } from "@tanstack/react-router";

import { SiteSettingsLayout } from "@/components/settings/site-settings-layout.tsx";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { parseSettingsSearch } from "@/lib/settings/settings-search.ts";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
  head: () => ({
    meta: buildNoIndexMeta("Settings"),
  }),
  validateSearch: parseSettingsSearch,
});

function SettingsRoute() {
  const search = Route.useSearch();

  return <SiteSettingsLayout search={search} />;
}
