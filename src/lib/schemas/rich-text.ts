import { z } from "zod";

/**
 * Inline formatting marks over a block's primary text. Marks are half-open
 * character ranges `[start, end)` into `props.text`; the plain string stays
 * canonical (word count, emptiness, clipboard, and slash detection all read
 * `text` unchanged). Ranges are normalized on write: sorted, clamped to the
 * text, empties dropped, and same-type overlapping/adjacent ranges merged.
 */

export const inlineMarkTypeSchema = z.enum([
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "code",
  "link",
  "formula",
]);

export type InlineMarkType = z.infer<typeof inlineMarkTypeSchema>;

export const inlineMarkSchema = z.object({
  type: inlineMarkTypeSchema,
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  /** Destination for `type: "link"` marks; unused by the styling marks. */
  href: z.string().optional(),
  /**
   * When set on a `link` mark, the run is an inline page link (icon + title +
   * arrow) targeting this workspace page id rather than a plain URL.
   */
  pageId: z.string().optional(),
  /**
   * `formula` marks only: the v2 formula source this token evaluates. The run
   * it covers is always the single {@link FORMULA_TOKEN_SENTINEL} character —
   * the rendered value is chrome, never document text, so re-evaluation cannot
   * move any offset (see `docs/proposals/inline-prose-tokens.md`).
   *
   * Interim home: once markdown becomes canonical the definition moves to page
   * frontmatter and this becomes an id reference.
   */
  expression: z.string().optional(),
});

export type InlineMark = z.infer<typeof inlineMarkSchema>;

/**
 * The single character a `formula` token occupies in `props.text` — U+FFFC
 * OBJECT REPLACEMENT CHARACTER, the standard stand-in for embedded content.
 *
 * Fixed width is the whole point: the rendered value lives in chrome, so a
 * re-evaluation never changes the string's length and never shifts a mark.
 * Nothing outside the editor should render this raw — read sites go through
 * `projectPlainText` (`lib/blocks/inline-formula.ts`).
 */
export const FORMULA_TOKEN_SENTINEL = "￼";

export const inlineMarksSchema = z.array(inlineMarkSchema);

/**
 * Block-level text and background colors (Notion-style palette). Stored on the
 * block base — any block type can carry them; rendering maps ids to CSS
 * variables defined in `styles.css` (light + dark values).
 */
export const blockColorSchema = z.enum([
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
]);

export type BlockColor = z.infer<typeof blockColorSchema>;
