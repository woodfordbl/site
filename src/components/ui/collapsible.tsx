import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { IconCaretRightFilled } from "@tabler/icons-react";

import { cn } from "@/lib/utils.ts";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
  );
}

function CollapsibleContent({
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      className={cn(
        "h-[var(--collapsible-panel-height)] overflow-hidden transition-[height,opacity] duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none",
        "data-[starting-style]:h-0 data-[starting-style]:opacity-0",
        "data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[ending-style]:duration-150",
        "[&[hidden]:not([hidden='until-found'])]:hidden",
        className
      )}
      data-slot="collapsible-content"
      {...props}
    />
  );
}

/** Filled caret for expand/collapse triggers — always muted; rotates 90° when open. */
function CollapsibleCaret({ className }: { className?: string }) {
  return (
    <IconCaretRightFilled
      className={cn(
        "size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-(--ease-out-strong)",
        "group-data-panel-open/label:rotate-90 motion-reduce:transition-none",
        className
      )}
    />
  );
}

export {
  Collapsible,
  CollapsibleCaret,
  CollapsibleContent,
  CollapsibleTrigger,
};
