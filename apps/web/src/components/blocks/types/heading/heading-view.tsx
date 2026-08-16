import { RichTextContent } from "@/components/editor/rich-text.tsx";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import type { BlockViewProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type HeadingViewProps = BlockViewProps<"heading">;

export function HeadingView({ props }: HeadingViewProps) {
  const Tag = `h${props.level}` as const;

  return (
    <Tag
      className={cn(
        headingSurfaceClassName,
        headingTypographyClassNames[props.level]
      )}
    >
      {props.text ? (
        <RichTextContent marks={props.marks} text={props.text} />
      ) : (
        " "
      )}
    </Tag>
  );
}
