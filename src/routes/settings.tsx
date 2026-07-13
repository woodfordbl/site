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
