import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { DEFAULT_SETTINGS_SECTION } from "@/components/settings/site-settings-sections.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";

export const Route = createFileRoute("/settings/")({
  component: SettingsIndexPage,
});

function SettingsIndexPage() {
  const isNarrow = useIsNarrowViewport();
  const navigate = Route.useNavigate();
  const search = Route.useSearch();

  useEffect(() => {
    if (!isNarrow) {
      navigate({
        params: { section: DEFAULT_SETTINGS_SECTION },
        replace: true,
        search,
        to: "/settings/$section",
      });
    }
  }, [isNarrow, navigate, search]);

  return null;
}
