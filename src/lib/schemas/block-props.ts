import { z } from "zod";

export const headingPropsSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  text: z.string(),
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

export const calloutPropsSchema = z.object({
  text: z.string(),
});

export const checklistPropsSchema = z.object({});

export const checklistItemPropsSchema = z.object({
  checked: z.boolean(),
  text: z.string(),
});

export const pageLinkPropsSchema = z.object({
  pageId: z.string(),
});

export const dividerPropsSchema = z.object({});

export type HeadingProps = z.infer<typeof headingPropsSchema>;
export type TextProps = z.infer<typeof textPropsSchema>;
export type ListProps = z.infer<typeof listPropsSchema>;
export type QuoteProps = z.infer<typeof quotePropsSchema>;
export type CalloutProps = z.infer<typeof calloutPropsSchema>;
export type ChecklistProps = z.infer<typeof checklistPropsSchema>;
export type ChecklistItemProps = z.infer<typeof checklistItemPropsSchema>;
export type PageLinkProps = z.infer<typeof pageLinkPropsSchema>;
export type DividerProps = z.infer<typeof dividerPropsSchema>;

export const blockPropsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), props: headingPropsSchema }),
  z.object({ type: z.literal("text"), props: textPropsSchema }),
  z.object({ type: z.literal("list"), props: listPropsSchema }),
  z.object({ type: z.literal("quote"), props: quotePropsSchema }),
  z.object({ type: z.literal("callout"), props: calloutPropsSchema }),
  z.object({ type: z.literal("checklist"), props: checklistPropsSchema }),
  z.object({
    type: z.literal("checklistItem"),
    props: checklistItemPropsSchema,
  }),
  z.object({ type: z.literal("pageLink"), props: pageLinkPropsSchema }),
  z.object({ type: z.literal("divider"), props: dividerPropsSchema }),
]);
