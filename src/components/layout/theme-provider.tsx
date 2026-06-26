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
import { writeThemePreferenceToDocument } from "@/lib/appearance/site-appearance-cookie.ts";
import type {
  ResolvedTheme,
  ThemePreference,
} from "@/lib/schemas/site-appearance.ts";

interface ThemeContextValue {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  theme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyResolvedTheme(resolvedTheme: ResolvedTheme): void {
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
}

interface ThemeProviderProps {
  children: ReactNode;
  initialHints: SiteAppearanceHints;
}

/** Applies site theme preference to `document.documentElement` and persists to cookie. */
export function ThemeProvider({ children, initialHints }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(
    initialHints.appearance.theme
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
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setPrefersDark(media.matches);
    };

    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    setThemeState(nextTheme);
    writeThemePreferenceToDocument(nextTheme);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme,
      setTheme,
      theme,
    }),
    [resolvedTheme, setTheme, theme]
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

/** Persists theme preference cookie after client changes. */
export function SyncSiteAppearanceCookieEffect() {
  const { theme } = useSiteAppearance();

  useEffect(() => {
    writeThemePreferenceToDocument(theme);
  }, [theme]);

  return null;
}
