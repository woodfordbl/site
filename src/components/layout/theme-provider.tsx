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
import type { CodeThemeId } from "@/lib/code/code-themes.ts";
import { setCodeTheme as setCodeThemeRuntime } from "@/lib/code/highlighter.ts";
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
  /** Syntax theme shared by code blocks, inline code, and the formula editor. */
  codeTheme: CodeThemeId;
  resolvedTheme: ResolvedTheme;
  setChartDither: (chartDither: ChartDitherMode) => void;
  setChartPalette: (chartPalette: ChartPaletteId) => void;
  setCodeTheme: (codeTheme: CodeThemeId) => void;
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

function applyCodeTheme(codeThemeId: CodeThemeId): void {
  document.documentElement.dataset.codeTheme = codeThemeId;
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
  const [codeThemeId, setCodeThemeState] = useState<CodeThemeId>(
    initialHints.appearance.codeTheme
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
      codeTheme: codeThemeId,
    }),
    [theme, textScale, chartPalette, chartDither, tooltipStyle, codeThemeId]
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

  // Loads the pair into Shiki and publishes the formula editor's token
  // variables. Async and non-blocking: until it resolves, code surfaces keep
  // the previous theme rather than flashing unstyled.
  useEffect(() => {
    applyCodeTheme(codeThemeId);
    setCodeThemeRuntime(codeThemeId).catch(() => {
      // Theming is cosmetic; the previous theme stays applied on failure.
    });
  }, [codeThemeId]);

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

  const setCodeTheme = useCallback(
    (nextCodeTheme: CodeThemeId) => {
      setCodeThemeState(nextCodeTheme);
      writeSiteAppearanceToDocument({
        ...appearanceSnapshot,
        codeTheme: nextCodeTheme,
      });
    },
    [appearanceSnapshot]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      chartDither,
      chartDitherEnabled,
      chartPalette,
      codeTheme: codeThemeId,
      resolvedTheme,
      setChartDither,
      setChartPalette,
      setCodeTheme,
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
      codeThemeId,
      resolvedTheme,
      setChartDither,
      setChartPalette,
      setCodeTheme,
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
  const {
    chartDither,
    chartPalette,
    codeTheme,
    textScale,
    theme,
    tooltipStyle,
  } = useSiteAppearance();

  useEffect(() => {
    writeSiteAppearanceToDocument({
      theme,
      textScale,
      chartPalette,
      chartDither,
      tooltipStyle,
      codeTheme,
    });
  }, [chartDither, chartPalette, codeTheme, textScale, theme, tooltipStyle]);

  return null;
}
