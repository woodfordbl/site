"use client";

import { IconSettings } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button.tsx";

interface SiteSettingsTriggerProps {
  pageId: string;
}

export function SiteSettingsTrigger({ pageId }: SiteSettingsTriggerProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Button
      className="pointer-events-auto"
      render={<Link search={{ pageId, returnTo: pathname }} to="/settings" />}
      size="xs"
      variant="outline"
    >
      <IconSettings />
      Settings
    </Button>
  );
}
