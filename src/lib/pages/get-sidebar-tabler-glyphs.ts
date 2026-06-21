import { createServerFn } from "@tanstack/react-start";

import type { TablerIconGlyph } from "@/lib/pages/page-icon-catalog.ts";
import { readTablerGlyphsByNames } from "@/lib/pages/read-tabler-glyphs.server.ts";

export const getSidebarTablerGlyphs = createServerFn({ method: "POST" })
  .validator((names: string[]) => names)
  .handler(
    async ({ data: names }): Promise<Record<string, TablerIconGlyph>> =>
      readTablerGlyphsByNames(names)
  );
