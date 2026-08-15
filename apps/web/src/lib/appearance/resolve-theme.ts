import type {
  ResolvedTheme,
  ThemePreference,
} from "@/lib/schemas/site-appearance.ts";

/** Maps stored theme preference + system signal to the active light/dark mode. */
export function resolveTheme(
  theme: ThemePreference,
  prefersDark: boolean
): ResolvedTheme {
  if (theme === "system") {
    return prefersDark ? "dark" : "light";
  }

  return theme;
}

export function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
