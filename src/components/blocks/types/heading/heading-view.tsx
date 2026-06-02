import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type HeadingViewProps = BlockViewProps<"heading">;

export function HeadingView({ props, className }: HeadingViewProps) {
  const Tag = `h${props.level}` as const;

  return (
    <Tag
      className={cn(
        headingSurfaceClassName,
        headingTypographyClassNames[props.level],
        className
      )}
    >
      {props.text || "\u00A0"}
    </Tag>
  );
}
