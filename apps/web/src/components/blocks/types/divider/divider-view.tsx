import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";

type DividerViewProps = BlockViewProps<"divider">;

export function DividerView(_props: DividerViewProps) {
  return <hr aria-hidden className="h-px w-full shrink-0 bg-border" />;
}
