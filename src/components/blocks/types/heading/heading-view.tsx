import {
  HeadingCollapseChevron,
  headingCollapseIndentClassName,
  useHeadingCollapsibleState,
} from "@/components/blocks/types/heading/heading-collapse-toggle.tsx";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type HeadingViewProps = BlockViewProps<"heading">;

export function HeadingView({ props, row }: HeadingViewProps) {
  const Tag = `h${props.level}` as const;
  const { collapsed, collapsible, toggle } = useHeadingCollapsibleState(row);

  return (
    <div
      className={cn("relative", collapsible && headingCollapseIndentClassName)}
      data-reveal-group=""
    >
      {collapsible ? (
        <HeadingCollapseChevron collapsed={collapsed} onToggle={toggle} />
      ) : null}
      <Tag
        className={cn(
          headingSurfaceClassName,
          headingTypographyClassNames[props.level]
        )}
      >
        {props.text || " "}
      </Tag>
    </div>
  );
}
