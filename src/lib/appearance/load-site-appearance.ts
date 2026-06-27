import { getSiteAppearance } from "@/lib/appearance/get-site-appearance.ts";
import type { SiteAppearanceHints } from "@/lib/appearance/read-site-appearance.server.ts";
import {
  readSystemPrefersDark,
  resolveTheme,
} from "@/lib/appearance/resolve-theme.ts";
import { readSiteAppearanceFromDocument } from "@/lib/appearance/site-appearance-cookie.ts";

/** Loads site appearance for SSR (`getSiteAppearance`) or client cookie + `matchMedia`. */
export function loadSiteAppearance(): Promise<SiteAppearanceHints> {
  if (typeof window === "undefined") {
    return getSiteAppearance();
  }

  const appearance = readSiteAppearanceFromDocument();
  return Promise.resolve({
    appearance,
    resolvedTheme: resolveTheme(appearance.theme, readSystemPrefersDark()),
  });
}
