import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import {
  bodyTextClassName,
  listMarkerCellClassName,
} from "@/lib/blocks/block-spacing.ts";
import { DEFAULT_CALLOUT_ICON } from "@/lib/blocks/callout-defaults.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type CalloutEditProps = BlockEditProps<"callout">;

export function CalloutEdit({
  props,
  onChange,
  ...keyboard
}: CalloutEditProps) {
  const resolvedIcon = props.icon ?? DEFAULT_CALLOUT_ICON;

  return (
    <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2">
      <div className={listMarkerCellClassName}>
        <GlyphIconPicker
          ariaLabel="Change callout icon"
          icon={resolvedIcon}
          onSelect={(icon) => onChange({ ...props, icon })}
          triggerButtonSize="icon-sm"
        />
      </div>
      <EditableSurface
        ariaLabel="Callout"
        className={cn(bodyTextClassName, "min-w-0 flex-1")}
        multiline
        onChange={(text) => onChange({ ...props, text })}
        placeholder="Callout"
        value={props.text}
        {...keyboard}
      />
    </div>
  );
}
