import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import {
  bodyTextClassName,
  canvasEditTextClassName,
} from "@/lib/blocks/block-spacing.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";

type TextEditProps = BlockEditProps<"text">;

const defaultTextPlaceholder = "Type something, or press / for commands";

export function TextEdit({
  props,
  onChange,
  parentType,
  row: _row,
  ...keyboard
}: TextEditProps) {
  const isListItem = parentType === "list";

  return (
    <EditableSurface
      ariaLabel="Text"
      className={isListItem ? canvasEditTextClassName : bodyTextClassName}
      multiline
      onChange={(text) => onChange({ ...props, text })}
      placeholder={isListItem ? "List" : defaultTextPlaceholder}
      placeholderVisibility={isListItem ? "when-empty" : "when-focused"}
      value={props.text}
      {...keyboard}
    />
  );
}
