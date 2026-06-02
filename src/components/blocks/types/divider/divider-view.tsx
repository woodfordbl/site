import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type DividerViewProps = BlockViewProps<"divider">;

export function DividerView({ className }: DividerViewProps) {
  return (
    <hr
      className={cn("my-0 w-full border-0 border-border border-t", className)}
    />
  );
}
