import { z } from "zod";

export const headingPropsSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
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
  collapsed: z.boolean().optional(),
});

export const textPropsSchema = z.object({
  text: z.string(),
});

export const listPropsSchema = z.object({
  variant: z.enum(["bullet", "ordered"]).default("bullet"),
});

export const quotePropsSchema = z.object({
  text: z.string(),
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

/** `tabs` block props: the author-chosen default tab (a `tab` block's id). */
export const tabsPropsSchema = z.object({
  defaultTabId: z.string().optional(),
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

export const tableRowPropsSchema = z.object({});

export const tableCellPropsSchema = z.object({
  text: z.string(),
});

/** `code` block props: source text plus a Shiki language id (defaults to plaintext). */
export const codePropsSchema = z.object({
  // Named `text` (not `code`) so it reuses the hasPrimaryText machinery in
  // create-block.ts (getTextFromBlock / withBlockText) and Turn-into carry-over.
  text: z.string(),
  /** Shiki language id (e.g. `ts`, `python`); omitted means plaintext. */
  language: z.string().optional(),
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
export type ToggleHeadingProps = z.infer<typeof toggleHeadingPropsSchema>;
export type TextProps = z.infer<typeof textPropsSchema>;
export type ListProps = z.infer<typeof listPropsSchema>;
export type QuoteProps = z.infer<typeof quotePropsSchema>;
export type CalloutProps = z.infer<typeof calloutPropsSchema>;
export type CodeProps = z.infer<typeof codePropsSchema>;
export type ChecklistProps = z.infer<typeof checklistPropsSchema>;
export type ChecklistItemProps = z.infer<typeof checklistItemPropsSchema>;
export type PageLinkProps = z.infer<typeof pageLinkPropsSchema>;
export type DividerProps = z.infer<typeof dividerPropsSchema>;
export type ColumnsProps = z.infer<typeof columnsPropsSchema>;
export type ColumnProps = z.infer<typeof columnPropsSchema>;
export type TabsProps = z.infer<typeof tabsPropsSchema>;
export type TabProps = z.infer<typeof tabPropsSchema>;
export type MediaKind = z.infer<typeof mediaKindSchema>;
export type MediaSource = z.infer<typeof mediaSourceSchema>;
export type MediaProps = z.infer<typeof mediaPropsSchema>;
export type EmbedProps = z.infer<typeof embedPropsSchema>;
export type TableProps = z.infer<typeof tablePropsSchema>;
export type TableRowProps = z.infer<typeof tableRowPropsSchema>;
export type TableCellProps = z.infer<typeof tableCellPropsSchema>;
