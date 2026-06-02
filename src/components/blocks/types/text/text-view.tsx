import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type TextViewProps = BlockViewProps<"text">;

export function TextView({ props, className }: TextViewProps) {
  return (
    <p className={cn("text-pretty", bodyTextClassName, className)}>
      {props.text || "\u00A0"}
    </p>
  );
}
