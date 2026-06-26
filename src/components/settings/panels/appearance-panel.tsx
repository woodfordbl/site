"use client";

import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import {
  SettingsItemCard,
  SettingsItemField,
  SettingsItemSelect,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import type { ThemePreference } from "@/lib/schemas/site-appearance.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

const THEME_OPTIONS: Array<{ label: string; value: ThemePreference }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

interface AppearancePanelProps {
  search: SettingsSearch;
}

export function AppearancePanel({ search }: AppearancePanelProps) {
  const { setTheme, theme } = useSiteAppearance();
  const section = getSettingsSection("appearance");

  return (
    <SettingsPanelShell
      description="Choose how the site looks on this device."
      search={search}
      section={section}
    >
      <SettingsItemCard>
        <SettingsItemField
          action={
            <SettingsItemSelect
              onValueChange={setTheme}
              options={THEME_OPTIONS}
              value={theme}
            />
          }
          description="Select your interface color scheme."
          title="Interface theme"
        />
      </SettingsItemCard>
    </SettingsPanelShell>
  );
}
