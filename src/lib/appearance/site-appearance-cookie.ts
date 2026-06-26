import { SITE_APPEARANCE_COOKIE_NAME } from "@/lib/appearance/site-appearance.constants.ts";
import {
  readDocumentCookie,
  writeDocumentCookie,
} from "@/lib/cookies/document-cookie.ts";
import {
  DEFAULT_SITE_APPEARANCE,
  type SiteAppearance,
  siteAppearanceSchema,
  type ThemePreference,
} from "@/lib/schemas/site-appearance.ts";

export function parseSiteAppearanceCookie(
  value: string | undefined
): SiteAppearance | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    const result = siteAppearanceSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serializeSiteAppearanceCookie(
  appearance: SiteAppearance
): string {
  return JSON.stringify(appearance);
}

export function readSiteAppearanceFromDocument(): SiteAppearance {
  return (
    parseSiteAppearanceCookie(
      readDocumentCookie(SITE_APPEARANCE_COOKIE_NAME)
    ) ?? DEFAULT_SITE_APPEARANCE
  );
}

export function writeSiteAppearanceToDocument(
  appearance: SiteAppearance
): boolean {
  return writeDocumentCookie(
    SITE_APPEARANCE_COOKIE_NAME,
    serializeSiteAppearanceCookie(appearance)
  );
}

export function writeThemePreferenceToDocument(
  theme: ThemePreference
): boolean {
  return writeSiteAppearanceToDocument({ theme });
}
