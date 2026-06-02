import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type CalloutViewProps = BlockViewProps<"callout">;

export function CalloutView({ props, className }: CalloutViewProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-card px-3 py-2",
        bodyTextClassName,
        className
      )}
    >
      {props.text || "\u00A0"}
    </div>
  );
}
