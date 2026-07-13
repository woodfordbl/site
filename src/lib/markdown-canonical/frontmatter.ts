import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";

import {
  pageFontSchema,
  pageHeaderImageSchema,
  pageTextScaleSchema,
} from "@/lib/schemas/page-settings.ts";

/**
 * Page frontmatter — the page document minus what the file path carries
 * (`slug`, `parentId`) and minus the body (`blocks`). Keys print in a fixed
 * order and defaults are omitted, so the frontmatter block is part of the
 * canonical normal form.
 */

export const pageFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  icon: z.string().optional(),
  /**
   * Explicit `parentId` override — emitted only when the tree parent differs
   * from the path-derived one (a child of home keeps its top-level slug, so
   * the folder layout alone cannot express that nesting).
   */
  parent: z.string().optional(),
  /** `sidebarOrder` — sibling sort weight in the sidebar tree. */
  order: z.number().optional(),
  font: pageFontSchema.optional(),
  textScale: pageTextScaleSchema.optional(),
  fullWidth: z.boolean().optional(),
  /** `headerImage` — the page cover. */
  cover: pageHeaderImageSchema.optional(),
});

export type PageFrontmatter = z.infer<typeof pageFrontmatterSchema>;

const KEY_ORDER = [
  "id",
  "title",
  "icon",
  "parent",
  "order",
  "font",
  "textScale",
  "fullWidth",
  "cover",
] as const satisfies readonly (keyof PageFrontmatter)[];

/** YAML for the frontmatter fence: fixed key order, absent keys omitted. */
export function printPageFrontmatter(frontmatter: PageFrontmatter): string {
  const ordered: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    const value = frontmatter[key];
    if (value !== undefined) {
      ordered[key] = value;
    }
  }
  return stringifyYaml(ordered, { lineWidth: 0 }).trimEnd();
}

/** Parse and validate a frontmatter fence body. Throws on schema mismatch. */
export function parsePageFrontmatter(raw: string): PageFrontmatter {
  return pageFrontmatterSchema.parse(parseYaml(raw));
}

/** Project a page document's metadata onto its frontmatter shape. */
export function pageToFrontmatter(page: {
  font?: PageFrontmatter["font"];
  fullWidth?: boolean;
  headerImage?: PageFrontmatter["cover"];
  icon?: string;
  id: string;
  sidebarOrder?: number;
  textScale?: PageFrontmatter["textScale"];
  title: string;
}): PageFrontmatter {
  return {
    id: page.id,
    title: page.title,
    ...(page.icon === undefined ? {} : { icon: page.icon }),
    ...(page.sidebarOrder === undefined ? {} : { order: page.sidebarOrder }),
    ...(page.font === undefined ? {} : { font: page.font }),
    ...(page.textScale === undefined ? {} : { textScale: page.textScale }),
    ...(page.fullWidth === undefined ? {} : { fullWidth: page.fullWidth }),
    ...(page.headerImage === undefined ? {} : { cover: page.headerImage }),
  };
}
