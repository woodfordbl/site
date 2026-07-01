import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type HeadingEditProps = BlockEditProps<"heading">;

export function HeadingEdit({
  props,
  onChange,
  ...keyboard
}: HeadingEditProps) {
  return (
    <EditableSurface
      ariaLabel="Heading"
      className={cn(
        headingSurfaceClassName,
        headingTypographyClassNames[props.level]
      )}
      marks={props.marks ?? []}
      onChange={(text, marks) => onChange({ ...props, text, marks })}
      placeholder={`Heading ${props.level}`}
      placeholderVisibility="when-empty"
      value={props.text}
      {...keyboard}
    />
  );
}
