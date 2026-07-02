import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { canvasEditTextClassName } from "@/lib/blocks/block-spacing.ts";
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
      className={cn(canvasEditTextClassName, "min-w-0 flex-1")}
      marks={props.marks ?? []}
      multiline
      onChange={(text, marks) => onChange({ ...props, text, marks })}
      placeholder="To-do"
      value={props.text}
      {...keyboard}
    />
  );
}
