import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";

type TextEditProps = BlockEditProps<"text">;

export function TextEdit({ props, onChange, ...keyboard }: TextEditProps) {
  return (
    <EditableSurface
      ariaLabel="Text"
      className={bodyTextClassName}
      multiline
      onChange={(text) => onChange({ ...props, text })}
      placeholder="Type something, or press / for commands"
      value={props.text}
      {...keyboard}
    />
  );
}
