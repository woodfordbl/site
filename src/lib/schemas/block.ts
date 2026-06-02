import { z } from "zod";

import {
  calloutPropsSchema,
  checklistItemPropsSchema,
  checklistPropsSchema,
  dividerPropsSchema,
  headingPropsSchema,
  listPropsSchema,
  pageLinkPropsSchema,
  quotePropsSchema,
  textPropsSchema,
} from "./block-props.ts";

export const blockTypeSchema = z.enum([
  "heading",
  "text",
  "list",
  "quote",
  "callout",
  "checklist",
  "checklistItem",
  "pageLink",
  "divider",
]);

export type BlockType = z.infer<typeof blockTypeSchema>;

const blockBaseSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  indent: z.number().int().min(0).max(4).optional(),
  type: blockTypeSchema,
});

export const blockSchema = z.discriminatedUnion("type", [
  blockBaseSchema.extend({
    type: z.literal("heading"),
    props: headingPropsSchema,
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

export function isContainerBlock(
  block: Block
): block is Extract<Block, { type: "list" | "checklist" }> {
  return block.type === "list" || block.type === "checklist";
}
