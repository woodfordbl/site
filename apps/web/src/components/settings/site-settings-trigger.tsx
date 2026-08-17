"use client";

import { IconSettings } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { DEFAULT_SETTINGS_SECTION } from "@/components/settings/site-settings-sections.ts";
import { Button } from "@/components/ui/button.tsx";

interface SiteSettingsTriggerProps {
  /** Page the user came from; omitted on database routes. */
  pageId?: string;
}

export function SiteSettingsTrigger({ pageId }: SiteSettingsTriggerProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Button
      className="pointer-events-auto"
      nativeButton={false}
      render={
        <Link
          params={{ section: DEFAULT_SETTINGS_SECTION }}
          search={{
            ...(pageId ? { pageId } : {}),
            returnTo: pathname,
          }}
          to="/settings/$section"
        />
      }
      size="xs"
      variant="outline"
    >
      <IconSettings />
      Settings
    </Button>
  );
}
