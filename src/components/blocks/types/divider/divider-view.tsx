import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";

type DividerViewProps = BlockViewProps<"divider">;

export function DividerView(_props: DividerViewProps) {
  return <hr className="my-0 w-full border-0 border-border border-t" />;
}
