import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type QuoteViewProps = BlockViewProps<"quote">;

export function QuoteView({ props }: QuoteViewProps) {
  return (
    <blockquote
      className={cn("border-primary border-l-2 pl-4 italic", bodyTextClassName)}
    >
      {props.text || "\u00A0"}
    </blockquote>
  );
}
