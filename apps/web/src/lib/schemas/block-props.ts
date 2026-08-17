import { z } from "zod";

import { inlineMarksSchema } from "./rich-text.ts";

export const headingPropsSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
  marks: inlineMarksSchema.optional(),
});

/**
 * `toggleHeading` block props: a heading title that owns its content as real
 * children. `collapsed` hides only those children (not following siblings).
 * Absent means expanded; kept optional so unchanged toggles keep their row
 * identity across tree rebuilds.
 */
export const toggleHeadingPropsSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
  marks: inlineMarksSchema.optional(),
  collapsed: z.boolean().optional(),
});

export const textPropsSchema = z.object({
  text: z.string(),
  marks: inlineMarksSchema.optional(),
});

export const listPropsSchema = z.object({
  variant: z.enum(["bullet", "ordered"]).default("bullet"),
});

export const quotePropsSchema = z.object({
  text: z.string(),
  marks: inlineMarksSchema.optional(),
});

/**
 * `callout` block props: an optional leading glyph. The callout is a container
 * whose body is real child blocks (a `text` child by default), so it carries no
 * primary text of its own. `icon` absent means the icon was removed.
 */
export const calloutPropsSchema = z.object({
  /** Emoji or `tabler:IconName` — same encoding as page icons. */
  icon: z.string().optional(),
});

export const checklistPropsSchema = z.object({});

export const checklistItemPropsSchema = z.object({
  checked: z.boolean(),
  text: z.string(),
  marks: inlineMarksSchema.optional(),
});

/** `pageLink` block props: target page id and optional slash-origin variant. */
export const pageLinkPropsSchema = z.object({
  pageId: z.string(),
  /** `child` = slash **New Page**; `linked` = **Link To Page**. */
  variant: z.enum(["linked", "child"]).optional(),
});

export const dividerPropsSchema = z.object({});

export const columnsPropsSchema = z.object({});

/** Flex-grow ratio for resizable column widths (default 1). */
export const columnPropsSchema = z.object({
  width: z.number().positive().optional(),
});

/** Tab bar density: trigger height and text scale. */
export const tabsSizeSchema = z.enum(["sm", "md", "lg"]);
/** Tab bar appearance: solid pill group, sliding pill, or underline. */
export const tabsVariantSchema = z.enum(["default", "indicator", "line"]);

/** `tabs` block props: the author-chosen default tab plus bar appearance. */
export const tabsPropsSchema = z.object({
  defaultTabId: z.string().optional(),
  /** Tab bar density (defaults to `md`). */
  size: tabsSizeSchema.optional(),
  /** Tab bar style (defaults to `indicator`). */
  variant: tabsVariantSchema.optional(),
});

/** `tab` block props: the tab's display name and optional leading glyph. */
export const tabPropsSchema = z.object({
  label: z.string().default(""),
  /** Emoji or `tabler:IconName` — same encoding as page/callout icons. */
  icon: z.string().optional(),
});

export const mediaKindSchema = z.enum(["image", "video"]);
export const mediaSourceSchema = z.enum(["url", "asset"]);

/** `media` block props: image/gif/video from URL or content-addressed IndexedDB asset id. */
export const mediaPropsSchema = z.object({
  kind: mediaKindSchema,
  source: mediaSourceSchema,
  /** URL string when `source: "url"`; SHA-256 content hash when `source: "asset"`. */
  src: z.string(),
  mimeType: z.string().optional(),
  fileName: z.string().optional(),
  alt: z.string().optional(),
  /** Display width as a percentage of the row (25–100). Omitted means full width. */
  widthPercent: z.number().min(25).max(100).optional(),
});

export const DEFAULT_TABLE_COLUMN_WIDTH = 120;

/** `table` block props: header row/column flags and column widths in pixels. */
export const tablePropsSchema = z.object({
  hasHeaderRow: z.boolean().default(true),
  hasHeaderColumn: z.boolean().default(false),
  columnWidths: z
    .array(z.number().positive())
    .default([
      DEFAULT_TABLE_COLUMN_WIDTH,
      DEFAULT_TABLE_COLUMN_WIDTH,
      DEFAULT_TABLE_COLUMN_WIDTH,
    ]),
});

export const tableRowPropsSchema = z.object({
  /** Explicit row height in pixels; acts as a minimum (content can grow taller). */
  height: z.number().positive().optional(),
});

export const tableCellPropsSchema = z.object({
  text: z.string(),
  marks: inlineMarksSchema.optional(),
});

/** `code` block props: source text plus a Shiki language id (defaults to plaintext). */
export const codePropsSchema = z.object({
  // Named `text` (not `code`) so it reuses the hasPrimaryText machinery in
  // create-block.ts (getTextFromBlock / withBlockText) and Turn-into carry-over.
  text: z.string(),
  /** Shiki language id (e.g. `ts`, `python`); omitted means plaintext. */
  language: z.string().optional(),
});

/** `database` block props: a reference to a workspace database entity. Rows never live in the block tree. */
export const databasePropsSchema = z.object({
  /** Empty string until the placeholder flow creates/links a database. */
  databaseId: z.string(),
  /** Saved view to render; defaults to the database's first view. */
  viewId: z.string().optional(),
  /** Hide the title row for this block (per placement, like Notion). */
  hideTitle: z.boolean().optional(),
});

/**
 * `map` block props: one place on a page. Data maps come from a `database`
 * block pointed at a map view instead; this is the "here is where that is"
 * block.
 *
 * The place is either pinned into the block (`markers`) or read from the host
 * page's row (`locationFieldId`) when that page is a database row or a row
 * template — the same `thisPage` scope inline formulas resolve against. A
 * bound block on a template renders each row's own location, so one block
 * gives every row page its map.
 */
export const mapPropsSchema = z.object({
  /** Camera center as [longitude, latitude]. */
  center: z.tuple([z.number(), z.number()]),
  zoom: z.number().min(0).max(22),
  /** Pins drawn on the map. Empty/absent means the block is a placeholder. */
  markers: z
    .array(
      z.object({
        lng: z.number(),
        lat: z.number(),
        label: z.string().optional(),
      })
    )
    .optional(),
  /**
   * `location` property of the host row this map follows. Set = the pin and
   * the camera come from the row, and `markers` is ignored; the stored `zoom`
   * still frames it, since the point differs per row but the framing should
   * not.
   */
  locationFieldId: z.string().optional(),
});

/** `embed` block props: provider iframe, direct image, or OG bookmark preview. */
export const embedPropsSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  caption: z.string().optional(),
  showCaption: z.boolean().optional(),
});

export type HeadingProps = z.infer<typeof headingPropsSchema>;

export type PageLinkProps = z.infer<typeof pageLinkPropsSchema>;

export type TabsSize = z.infer<typeof tabsSizeSchema>;
export type TabsVariant = z.infer<typeof tabsVariantSchema>;

export type MediaKind = z.infer<typeof mediaKindSchema>;

export type MediaProps = z.infer<typeof mediaPropsSchema>;
export type DatabaseProps = z.infer<typeof databasePropsSchema>;
export type EmbedProps = z.infer<typeof embedPropsSchema>;
export type MapProps = z.infer<typeof mapPropsSchema>;
