import { segmentRichText } from "@/lib/blocks/rich-text.ts";
import type { InlineMark, InlineMarkType } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/** Presentation for each inline mark, shared by the view renderer and the editable surface. */
export const inlineMarkClassNames: Record<InlineMarkType, string> = {
  bold: "font-semibold",
  italic: "italic",
  underline: "underline underline-offset-2",
  strikethrough: "line-through",
  code: "rounded bg-muted px-1 py-px font-mono text-[0.85em]",
};

export function classNameForMarks(marks: readonly InlineMarkType[]): string {
  return cn(marks.map((mark) => inlineMarkClassNames[mark]));
}

interface RichTextContentProps {
  marks?: InlineMark[];
  text: string;
}

/**
 * Read-only rich text: plain runs as bare text, marked runs as styled spans.
 * Newlines stay literal — parents render with `whitespace-pre-wrap`.
 */
export function RichTextContent({ text, marks }: RichTextContentProps) {
  if (!marks || marks.length === 0) {
    return text;
  }

  let offset = 0;
  return segmentRichText(text, marks).map((segment) => {
    const key = `${offset}:${segment.marks.join("-")}`;
    offset += segment.text.length;
    return (
      <span
        className={
          segment.marks.length > 0
            ? classNameForMarks(segment.marks)
            : undefined
        }
        key={key}
      >
        {segment.text}
      </span>
    );
  });
}
