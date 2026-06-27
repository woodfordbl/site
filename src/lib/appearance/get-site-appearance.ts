import { createServerFn } from "@tanstack/react-start";
import type { SiteAppearanceHints } from "@/lib/appearance/read-site-appearance.server.ts";
import { readSiteAppearanceFromRequest } from "@/lib/appearance/read-site-appearance.server.ts";

export const getSiteAppearance = createServerFn({ method: "GET" }).handler(
  async (): Promise<SiteAppearanceHints> => readSiteAppearanceFromRequest()
);
