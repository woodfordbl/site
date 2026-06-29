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
  ThemePreference,
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
  textScale: PageTextScale;
  theme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Rest iOS Safari bar tint per theme — the `--background` token as hex (see
 * styles.css). Rendered as `prefers-color-scheme` media metas in __root so iOS
 * picks the right one natively; not set from JS (iOS doesn't reliably re-read a
 * JS-updated `theme-color`, and a JS write would clobber the media variants).
 */
export const THEME_COLOR_BY_APPEARANCE = {
  dark: "#181611",
  light: "#f9f9f5",
} as const;

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

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

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
        theme: nextTheme,
        textScale,
        chartPalette,
        chartDither,
      });
    },
    [textScale, chartPalette, chartDither]
  );

  const setTextScale = useCallback(
    (nextTextScale: PageTextScale) => {
      setTextScaleState(nextTextScale);
      writeSiteAppearanceToDocument({
        theme,
        textScale: nextTextScale,
        chartPalette,
        chartDither,
      });
    },
    [theme, chartPalette, chartDither]
  );

  const setChartPalette = useCallback(
    (nextChartPalette: ChartPaletteId) => {
      setChartPaletteState(nextChartPalette);
      writeSiteAppearanceToDocument({
        theme,
        textScale,
        chartPalette: nextChartPalette,
        chartDither,
      });
    },
    [theme, textScale, chartDither]
  );

  const setChartDither = useCallback(
    (nextChartDither: ChartDitherMode) => {
      setChartDitherState(nextChartDither);
      writeSiteAppearanceToDocument({
        theme,
        textScale,
        chartPalette,
        chartDither: nextChartDither,
      });
    },
    [theme, textScale, chartPalette]
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
      textScale,
      theme,
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
      textScale,
      theme,
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
  const { chartDither, chartPalette, textScale, theme } = useSiteAppearance();

  useEffect(() => {
    writeSiteAppearanceToDocument({
      theme,
      textScale,
      chartPalette,
      chartDither,
    });
  }, [chartDither, chartPalette, textScale, theme]);

  return null;
}
