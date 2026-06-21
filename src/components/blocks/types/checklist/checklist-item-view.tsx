import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type ChecklistItemViewProps = BlockViewProps<"checklistItem">;

export function ChecklistItemView({ props }: ChecklistItemViewProps) {
  return (
    <span className={cn(bodyTextClassName, "min-w-0 flex-1")}>
      {props.text || "\u00A0"}
    </span>
  );
}
