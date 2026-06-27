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
import type { PageTextScale } from "@/lib/schemas/page-settings.ts";
import type {
  ResolvedTheme,
  ThemePreference,
} from "@/lib/schemas/site-appearance.ts";

interface ThemeContextValue {
  resolvedTheme: ResolvedTheme;
  setTextScale: (textScale: PageTextScale) => void;
  setTheme: (theme: ThemePreference) => void;
  textScale: PageTextScale;
  theme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyResolvedTheme(resolvedTheme: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
}

function applyTextScale(textScale: PageTextScale): void {
  document.documentElement.dataset.pageTextScale = textScale;
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
  const [prefersDark, setPrefersDark] = useState(() =>
    initialHints.appearance.theme === "system"
      ? readSystemPrefersDark()
      : initialHints.resolvedTheme === "dark"
  );

  const resolvedTheme = useMemo(
    () => resolveTheme(theme, prefersDark),
    [prefersDark, theme]
  );

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    applyTextScale(textScale);
  }, [textScale]);

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
      writeSiteAppearanceToDocument({ theme: nextTheme, textScale });
    },
    [textScale]
  );

  const setTextScale = useCallback(
    (nextTextScale: PageTextScale) => {
      setTextScaleState(nextTextScale);
      writeSiteAppearanceToDocument({ theme, textScale: nextTextScale });
    },
    [theme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme,
      setTextScale,
      setTheme,
      textScale,
      theme,
    }),
    [resolvedTheme, setTextScale, setTheme, textScale, theme]
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
  const { textScale, theme } = useSiteAppearance();

  useEffect(() => {
    writeSiteAppearanceToDocument({ theme, textScale });
  }, [textScale, theme]);

  return null;
}
