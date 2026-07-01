import { RichTextContent } from "@/components/editor/rich-text.tsx";
import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type TextViewProps = BlockViewProps<"text">;

export function TextView({ props }: TextViewProps) {
  return (
    <p className={cn("whitespace-pre-wrap text-pretty", bodyTextClassName)}>
      {props.text ? (
        <RichTextContent marks={props.marks} text={props.text} />
      ) : (
        "\u00A0"
      )}
    </p>
  );
}
