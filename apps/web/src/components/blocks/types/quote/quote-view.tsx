import { RichTextContent } from "@/components/editor/rich-text.tsx";
import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type QuoteViewProps = BlockViewProps<"quote">;

export function QuoteView({ props }: QuoteViewProps) {
  return (
    <blockquote
      className={cn(
        "whitespace-pre-wrap border-primary border-l-2 pl-4 italic",
        bodyTextClassName
      )}
    >
      {props.text ? (
        <RichTextContent marks={props.marks} text={props.text} />
      ) : (
        "\u00A0"
      )}
    </blockquote>
  );
}
