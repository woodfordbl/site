import {
  HeadingCollapseChevron,
  headingCollapseIndentClassName,
  useHeadingCollapsibleState,
} from "@/components/blocks/types/heading/heading-collapse-toggle.tsx";
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
  row,
  ...keyboard
}: HeadingEditProps) {
  const { collapsed, collapsible, toggle } = useHeadingCollapsibleState(row);

  return (
    <div
      className={cn("relative", collapsible && headingCollapseIndentClassName)}
      data-reveal-group=""
    >
      {collapsible ? (
        <HeadingCollapseChevron collapsed={collapsed} onToggle={toggle} />
      ) : null}
      <EditableSurface
        ariaLabel="Heading"
        className={cn(
          headingSurfaceClassName,
          headingTypographyClassNames[props.level]
        )}
        onChange={(text) => onChange({ ...props, text })}
        placeholder={`Heading ${props.level}`}
        placeholderVisibility="when-empty"
        value={props.text}
        {...keyboard}
      />
    </div>
  );
}
