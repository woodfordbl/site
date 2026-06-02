import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type ChecklistItemEditProps = BlockEditProps<"checklistItem">;

export function ChecklistItemEdit({
  props,
  onChange,
  ...keyboard
}: ChecklistItemEditProps) {
  return (
    <EditableSurface
      ariaLabel="Checklist item"
      className={cn(bodyTextClassName, "min-w-0 flex-1")}
      multiline
      onChange={(text) => onChange({ ...props, text })}
      placeholder="To-do"
      value={props.text}
      {...keyboard}
    />
  );
}
