import { useRef } from "react";

import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";

type CalloutEditProps = BlockEditProps<"callout">;

export function CalloutEdit({
  props,
  onChange,
  ...keyboard
}: CalloutEditProps) {
  const calloutBodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="rounded-md bg-card px-3 py-2">
      <EditableSurface
        ariaLabel="Callout"
        className={bodyTextClassName}
        multiline
        onChange={(text) => onChange({ ...props, text })}
        placeholder="Callout"
        textareaRef={calloutBodyRef}
        value={props.text}
        {...keyboard}
      />
    </div>
  );
}
