"use client";

import { IconChevronLeft } from "@tabler/icons-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import type { SettingsSectionDefinition } from "@/components/settings/site-settings-sections.ts";
import { Button } from "@/components/ui/button.tsx";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

interface SettingsPanelShellProps {
  children?: ReactNode;
  description?: string;
  search: SettingsSearch;
  section: SettingsSectionDefinition;
}

export function SettingsPanelShell({
  children,
  description,
  search,
  section,
}: SettingsPanelShellProps) {
  const isNarrow = useIsNarrowViewport();

  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">
      {isNarrow ? (
        <Button
          className="-ml-2 w-fit justify-start px-2 font-normal text-muted-foreground"
          render={<Link search={search} to="/settings" />}
          size="sm"
          variant="ghost"
        >
          <IconChevronLeft className="stroke-[1.5px]" />
          Settings
        </Button>
      ) : null}

      <div className="flex flex-col gap-1">
        <h1 className="font-heading font-medium text-2xl">{section.label}</h1>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>

      {children}
    </div>
  );
}
