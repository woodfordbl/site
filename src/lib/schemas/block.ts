import { z } from "zod";

import {
  calloutPropsSchema,
  checklistItemPropsSchema,
  checklistPropsSchema,
  codePropsSchema,
  columnPropsSchema,
  columnsPropsSchema,
  databasePropsSchema,
  dividerPropsSchema,
  embedPropsSchema,
  headingPropsSchema,
  listPropsSchema,
  mediaPropsSchema,
  pageLinkPropsSchema,
  quotePropsSchema,
  tableCellPropsSchema,
  tablePropsSchema,
  tableRowPropsSchema,
  tabPropsSchema,
  tabsPropsSchema,
  textPropsSchema,
  toggleHeadingPropsSchema,
} from "./block-props.ts";
import { blockColorSchema } from "./rich-text.ts";

export const blockTypeSchema = z.enum([
  "heading",
  "toggleHeading",
  "text",
  "list",
  "quote",
  "callout",
  "code",
  "checklist",
  "checklistItem",
  "pageLink",
  "divider",
  "columns",
  "column",
  "tabs",
  "tab",
  "media",
  "embed",
  "database",
  "table",
  "tableRow",
  "tableCell",
]);

export type BlockType = z.infer<typeof blockTypeSchema>;

const blockBaseSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  indent: z.number().int().min(0).max(4).optional(),
  type: blockTypeSchema,
  /** Block-level text color (Notion-style palette id). */
  color: blockColorSchema.optional(),
  /** Block-level background color (Notion-style palette id). */
  backgroundColor: blockColorSchema.optional(),
});

export const blockSchema = z.discriminatedUnion("type", [
  blockBaseSchema.extend({
    type: z.literal("heading"),
    props: headingPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("toggleHeading"),
    props: toggleHeadingPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("text"),
    props: textPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("list"),
    props: listPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("quote"),
    props: quotePropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("callout"),
    props: calloutPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("code"),
    props: codePropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("checklist"),
    props: checklistPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("checklistItem"),
    props: checklistItemPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("pageLink"),
    props: pageLinkPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("divider"),
    props: dividerPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("columns"),
    props: columnsPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("column"),
    props: columnPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("tabs"),
    props: tabsPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("tab"),
    props: tabPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("media"),
    props: mediaPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("embed"),
    props: embedPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("database"),
    props: databasePropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("table"),
    props: tablePropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("tableRow"),
    props: tableRowPropsSchema,
  }),
  blockBaseSchema.extend({
    type: z.literal("tableCell"),
    props: tableCellPropsSchema,
  }),
]);

export type Block = z.infer<typeof blockSchema>;

export const canvasPlacementSchema = z.object({
  scope: z.literal("canvas"),
  anchorId: z.string(),
  position: z.enum(["before", "after", "end"]),
});

export const containerPlacementSchema = z.object({
  scope: z.literal("container"),
  parentId: z.string(),
  position: z.enum(["start", "after"]),
  anchorId: z.string().optional(),
});

export const placementSchema = z.discriminatedUnion("scope", [
  canvasPlacementSchema,
  containerPlacementSchema,
]);

export type Placement = z.infer<typeof placementSchema>;

export function getBlockParentId(block: Block): string | null {
  return block.parentId ?? null;
}
