import { getCookie, getRequestHeader } from "@tanstack/react-start/server";
import { resolveTheme } from "@/lib/appearance/resolve-theme.ts";
import { SITE_APPEARANCE_COOKIE_NAME } from "@/lib/appearance/site-appearance.constants.ts";
import { parseSiteAppearanceCookie } from "@/lib/appearance/site-appearance-cookie.ts";
import {
  DEFAULT_SITE_APPEARANCE,
  type ResolvedTheme,
  type SiteAppearance,
} from "@/lib/schemas/site-appearance.ts";

const PREFERS_DARK_SEC_CH_PATTERN = /\bdark\b/i;

function prefersDarkFromSecChUa(headers: string | null | undefined): boolean {
  if (!headers) {
    return false;
  }

  return PREFERS_DARK_SEC_CH_PATTERN.test(headers);
}

export interface SiteAppearanceHints {
  appearance: SiteAppearance;
  resolvedTheme: ResolvedTheme;
}

export function readSiteAppearanceFromRequest(): SiteAppearanceHints {
  const appearance =
    parseSiteAppearanceCookie(getCookie(SITE_APPEARANCE_COOKIE_NAME)) ??
    DEFAULT_SITE_APPEARANCE;

  const prefersDark = prefersDarkFromSecChUa(
    getRequestHeader("sec-ch-prefers-color-scheme")
  );

  return {
    appearance,
    resolvedTheme: resolveTheme(appearance.theme, prefersDark),
  };
}
