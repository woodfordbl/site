"use client";

import type { ReactNode } from "react";

import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import {
  SettingsItemCard,
  SettingsItemField,
  SettingsItemSelect,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import {
  CHART_DITHER_MODE_LABELS,
  CHART_DITHER_MODES,
  CHART_PALETTE_IDS,
  CHART_PALETTES,
  type ChartDitherMode,
  type ChartPaletteId,
} from "@/lib/charts/chart-palettes.ts";
import type { PageTextScale } from "@/lib/schemas/page-settings.ts";
import type { ThemePreference } from "@/lib/schemas/site-appearance.ts";

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

const PALETTE_SWATCH_TOKENS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** Live preview of a palette's five chart colors. */
function PaletteSwatch({ palette }: { palette: ChartPaletteId }) {
  return (
    <div className="flex items-center gap-1" data-chart-palette={palette}>
      {PALETTE_SWATCH_TOKENS.map((token) => (
        <span
          className="size-3.5 rounded-full ring-1 ring-foreground/10"
          key={token}
          style={{ backgroundColor: token }}
        />
      ))}
    </div>
  );
}

const CHART_PALETTE_OPTIONS: Array<{
  label: string;
  leading: ReactNode;
  value: ChartPaletteId;
}> = CHART_PALETTE_IDS.map((id) => ({
  value: id,
  label: CHART_PALETTES[id].label,
  leading: <PaletteSwatch palette={id} />,
}));

const CHART_DITHER_OPTIONS: Array<{ label: string; value: ChartDitherMode }> =
  CHART_DITHER_MODES.map((value) => ({
    value,
    label: CHART_DITHER_MODE_LABELS[value],
  }));

export function AppearancePanel() {
  const {
    chartDither,
    chartPalette,
    setChartDither,
    setChartPalette,
    setTextScale,
    setTheme,
    textScale,
    theme,
  } = useSiteAppearance();
  const section = getSettingsSection("appearance");

  return (
    <SettingsPanelShell
      description="Choose how the site looks on this device."
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
        <SettingsItemField
          action={
            <SettingsItemSelect
              onValueChange={setChartPalette}
              options={CHART_PALETTE_OPTIONS}
              value={chartPalette}
            />
          }
          description="Default color palette for analytics charts across the workspace."
          title="Chart palette"
        />
        <SettingsItemField
          action={
            <SettingsItemSelect
              onValueChange={setChartDither}
              options={CHART_DITHER_OPTIONS}
              value={chartDither}
            />
          }
          description="Render charts with a dithered texture. Dark mode only applies it when the dark theme is active."
          title="Chart dither"
        />
      </SettingsItemCard>
    </SettingsPanelShell>
  );
}
