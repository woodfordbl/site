import { useRef } from "react";

import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { bodyTextClassName } from "@/lib/blocks/block-spacing.ts";
import type { BlockEditProps } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

type QuoteEditProps = BlockEditProps<"quote">;

export function QuoteEdit({ props, onChange, ...keyboard }: QuoteEditProps) {
  const quoteBodyRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="border-primary border-l-2 pl-4">
      <EditableSurface
        ariaLabel="Quote"
        className={cn(bodyTextClassName, "italic")}
        multiline
        onChange={(text) => onChange({ ...props, text })}
        placeholder="Quote"
        textareaRef={quoteBodyRef}
        value={props.text}
        {...keyboard}
      />
    </div>
  );
}
