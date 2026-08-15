"use client";

import type { ReactNode } from "react";

import type { SettingsSectionDefinition } from "@/components/settings/site-settings-sections.ts";

interface SettingsPanelShellProps {
  children?: ReactNode;
  description?: string;
  section: SettingsSectionDefinition;
}

export function SettingsPanelShell({
  children,
  description,
  section,
}: SettingsPanelShellProps) {
  return (
    <div className="flex flex-col gap-8 p-6 md:p-8">
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
