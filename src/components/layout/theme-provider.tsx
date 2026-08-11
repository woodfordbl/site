"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  refreshBrowserChromeTint,
  releaseBrowserChromeTintToCanvas,
} from "@/lib/appearance/browser-chrome-tint.ts";
import type { SiteAppearanceHints } from "@/lib/appearance/read-site-appearance.server.ts";
import {
  readSystemPrefersDark,
  resolveTheme,
} from "@/lib/appearance/resolve-theme.ts";
import { writeSiteAppearanceToDocument } from "@/lib/appearance/site-appearance-cookie.ts";
import type {
  ChartDitherMode,
  ChartPaletteId,
} from "@/lib/charts/chart-palettes.ts";
import type { PageTextScale } from "@/lib/schemas/page-settings.ts";
import type {
  ResolvedTheme,
  SiteAppearance,
  ThemePreference,
  TooltipStyle,
} from "@/lib/schemas/site-appearance.ts";

interface ThemeContextValue {
  chartDither: ChartDitherMode;
  /** Resolved from `chartDither` + the active theme: should charts dither right now? */
  chartDitherEnabled: boolean;
  chartPalette: ChartPaletteId;
  resolvedTheme: ResolvedTheme;
  setChartDither: (chartDither: ChartDitherMode) => void;
  setChartPalette: (chartPalette: ChartPaletteId) => void;
  setTextScale: (textScale: PageTextScale) => void;
  setTheme: (theme: ThemePreference) => void;
  setTooltipStyle: (tooltipStyle: TooltipStyle) => void;
  textScale: PageTextScale;
  theme: ThemePreference;
  tooltipStyle: TooltipStyle;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyResolvedTheme(resolvedTheme: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
}

function applyTextScale(textScale: PageTextScale): void {
  document.documentElement.dataset.pageTextScale = textScale;
}

function applyChartPalette(chartPalette: ChartPaletteId): void {
  document.documentElement.dataset.chartPalette = chartPalette;
}

function applyChartDither(chartDither: ChartDitherMode): void {
  document.documentElement.dataset.chartDither = chartDither;
}

function applyTooltipStyle(tooltipStyle: TooltipStyle): void {
  document.documentElement.dataset.tooltipStyle = tooltipStyle;
}

interface ThemeProviderProps {
  children: ReactNode;
  initialHints: SiteAppearanceHints;
}

/** Applies site appearance preferences to `document.documentElement` and persists to cookie. */
export function ThemeProvider({ children, initialHints }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(
    initialHints.appearance.theme
  );
  const [textScale, setTextScaleState] = useState<PageTextScale>(
    initialHints.appearance.textScale
  );
  const [chartPalette, setChartPaletteState] = useState<ChartPaletteId>(
    initialHints.appearance.chartPalette
  );
  const [chartDither, setChartDitherState] = useState<ChartDitherMode>(
    initialHints.appearance.chartDither
  );
  const [tooltipStyle, setTooltipStyleState] = useState<TooltipStyle>(
    initialHints.appearance.tooltipStyle
  );
  const [prefersDark, setPrefersDark] = useState(() =>
    initialHints.appearance.theme === "system"
      ? readSystemPrefersDark()
      : initialHints.resolvedTheme === "dark"
  );

  const resolvedTheme = useMemo(
    () => resolveTheme(theme, prefersDark),
    [prefersDark, theme]
  );

  const chartDitherEnabled =
    chartDither === "on" ||
    (chartDither === "dark" && resolvedTheme === "dark");

  const appearanceSnapshot = useMemo<SiteAppearance>(
    () => ({
      theme,
      textScale,
      chartPalette,
      chartDither,
      tooltipStyle,
    }),
    [theme, textScale, chartPalette, chartDither, tooltipStyle]
  );

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
    // Safari only re-samples the canvas off touch-driven paints, so a theme flip
    // nobody touched would leave the chrome bands on the old theme's color —
    // a light page in black bands. Nudge it (see browser-chrome-tint.ts).
    refreshBrowserChromeTint(resolvedTheme);
  }, [resolvedTheme]);

  // After first paint, let the iOS Safari chrome bands track the document canvas
  // instead of the frozen SSR `theme-color` (see browser-chrome-tint.ts).
  useEffect(() => {
    releaseBrowserChromeTintToCanvas();
  }, []);

  useEffect(() => {
    applyTextScale(textScale);
  }, [textScale]);

  useEffect(() => {
    applyChartPalette(chartPalette);
  }, [chartPalette]);

  useEffect(() => {
    applyChartDither(chartDither);
  }, [chartDither]);

  useEffect(() => {
    applyTooltipStyle(tooltipStyle);
  }, [tooltipStyle]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setPrefersDark(media.matches);
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      setThemeState(nextTheme);
      writeSiteAppearanceToDocument({
        ...appearanceSnapshot,
        theme: nextTheme,
      });
    },
    [appearanceSnapshot]
  );

  const setTextScale = useCallback(
    (nextTextScale: PageTextScale) => {
      setTextScaleState(nextTextScale);
      writeSiteAppearanceToDocument({
        ...appearanceSnapshot,
        textScale: nextTextScale,
      });
    },
    [appearanceSnapshot]
  );

  const setChartPalette = useCallback(
    (nextChartPalette: ChartPaletteId) => {
      setChartPaletteState(nextChartPalette);
      writeSiteAppearanceToDocument({
        ...appearanceSnapshot,
        chartPalette: nextChartPalette,
      });
    },
    [appearanceSnapshot]
  );

  const setChartDither = useCallback(
    (nextChartDither: ChartDitherMode) => {
      setChartDitherState(nextChartDither);
      writeSiteAppearanceToDocument({
        ...appearanceSnapshot,
        chartDither: nextChartDither,
      });
    },
    [appearanceSnapshot]
  );

  const setTooltipStyle = useCallback(
    (nextTooltipStyle: TooltipStyle) => {
      setTooltipStyleState(nextTooltipStyle);
      writeSiteAppearanceToDocument({
        ...appearanceSnapshot,
        tooltipStyle: nextTooltipStyle,
      });
    },
    [appearanceSnapshot]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      chartDither,
      chartDitherEnabled,
      chartPalette,
      resolvedTheme,
      setChartDither,
      setChartPalette,
      setTextScale,
      setTheme,
      setTooltipStyle,
      textScale,
      theme,
      tooltipStyle,
    }),
    [
      chartDither,
      chartDitherEnabled,
      chartPalette,
      resolvedTheme,
      setChartDither,
      setChartPalette,
      setTextScale,
      setTheme,
      setTooltipStyle,
      textScale,
      theme,
      tooltipStyle,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useSiteAppearance must be used within ThemeProvider.");
  }

  return context;
}

export function useSiteAppearance(): ThemeContextValue {
  return useThemeContext();
}

/** Persists appearance preferences cookie after client changes. */
export function SyncSiteAppearanceCookieEffect() {
  const { chartDither, chartPalette, textScale, theme, tooltipStyle } =
    useSiteAppearance();

  useEffect(() => {
    writeSiteAppearanceToDocument({
      theme,
      textScale,
      chartPalette,
      chartDither,
      tooltipStyle,
    });
  }, [chartDither, chartPalette, textScale, theme, tooltipStyle]);

  return null;
}
