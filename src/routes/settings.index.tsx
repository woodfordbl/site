import { createFileRoute, redirect } from "@tanstack/react-router";

import { DEFAULT_SETTINGS_SECTION } from "@/components/settings/site-settings-sections.ts";

export const Route = createFileRoute("/settings/")({
  // Land on a real section on every viewport; the sidebar is reached via the
  // swipe-reveal inset rather than a standalone index screen. Redirecting in
  // beforeLoad (instead of a client effect) avoids rendering the empty index.
  beforeLoad: () => {
    throw redirect({
      params: { section: DEFAULT_SETTINGS_SECTION },
      replace: true,
      search: true,
      to: "/settings/$section",
    });
  },
});
