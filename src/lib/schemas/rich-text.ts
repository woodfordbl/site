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
]);

export type InlineMarkType = z.infer<typeof inlineMarkTypeSchema>;

export const inlineMarkSchema = z.object({
  type: inlineMarkTypeSchema,
  start: z.number().int().min(0),
  end: z.number().int().min(0),
  /** Destination for `type: "link"` marks; unused by the styling marks. */
  href: z.string().optional(),
});

export type InlineMark = z.infer<typeof inlineMarkSchema>;

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
