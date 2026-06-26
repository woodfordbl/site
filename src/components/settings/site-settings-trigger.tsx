"use client";

import { IconSettings } from "@tabler/icons-react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Button } from "@/components/ui/button.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip.tsx";

interface SiteSettingsTriggerProps {
  pageId: string;
}

export function SiteSettingsTrigger({ pageId }: SiteSettingsTriggerProps) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label="Settings"
            className="pointer-events-auto text-muted-foreground"
            render={
              <Link search={{ pageId, returnTo: pathname }} to="/settings" />
            }
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <IconSettings />
      </TooltipTrigger>
      <TooltipContent>Settings</TooltipContent>
    </Tooltip>
  );
}
