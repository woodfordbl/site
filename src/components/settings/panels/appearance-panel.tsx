"use client";

import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import {
  SettingsItemCard,
  SettingsItemField,
  SettingsItemSelect,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import type { PageTextScale } from "@/lib/schemas/page-settings.ts";
import type { ThemePreference } from "@/lib/schemas/site-appearance.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

const THEME_OPTIONS: Array<{ label: string; value: ThemePreference }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const TEXT_SIZE_OPTIONS: Array<{ label: string; value: PageTextScale }> = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
];

interface AppearancePanelProps {
  search: SettingsSearch;
}

export function AppearancePanel({ search }: AppearancePanelProps) {
  const { setTextScale, setTheme, textScale, theme } = useSiteAppearance();
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
        <SettingsItemField
          action={
            <SettingsItemSelect
              onValueChange={setTextScale}
              options={TEXT_SIZE_OPTIONS}
              value={textScale}
            />
          }
          description="Default text size for pages. Individual pages can override this."
          title="Text size"
        />
      </SettingsItemCard>
    </SettingsPanelShell>
  );
}
