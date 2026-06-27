import { createFileRoute, notFound } from "@tanstack/react-router";

import { SiteSettingsSectionContent } from "@/components/settings/site-settings-section-content.tsx";
import { isSettingsSectionId } from "@/components/settings/site-settings-sections.ts";

export const Route = createFileRoute("/settings/$section")({
  beforeLoad: ({ params }) => {
    if (!isSettingsSectionId(params.section)) {
      throw notFound();
    }
  },
  component: SettingsSectionPage,
});

function SettingsSectionPage() {
  const { section: sectionId } = Route.useParams();
  const search = Route.useSearch();

  if (!isSettingsSectionId(sectionId)) {
    throw notFound();
  }

  return <SiteSettingsSectionContent search={search} section={sectionId} />;
}
