import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type TableCellViewProps = BlockViewProps<"tableCell">;

export function TableCellView({ props }: TableCellViewProps) {
  return (
    <span className={cn("block min-w-0 whitespace-pre-wrap break-words")}>
      {props.text || "\u00a0"}
    </span>
  );
}
