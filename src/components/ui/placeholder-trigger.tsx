import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type * as React from "react";

import {
  buttonIconChildClassNames,
  iconSlotClassName,
} from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const placeholderTriggerClassName = cn(
  "group/placeholder-trigger inline-flex min-h-9 w-full min-w-0 select-none items-center justify-start gap-2 rounded-lg border border-transparent bg-muted px-3 py-2 font-normal text-muted-foreground text-sm outline-none transition-[color,background-color] hover:bg-muted/80 disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-muted/80 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:stroke-[1.5px]",
  buttonIconChildClassNames.sm
);

type PlaceholderTriggerProps = ButtonPrimitive.Props & {
  icon?: React.ReactNode;
};

function PlaceholderTrigger({
  className,
  icon,
  children,
  ...props
}: PlaceholderTriggerProps) {
  return (
    <ButtonPrimitive
      className={cn(placeholderTriggerClassName, className)}
      data-slot="placeholder-trigger"
      type="button"
      {...props}
    >
      {icon ? (
        <span className={iconSlotClassName("sm", "shrink-0")}>{icon}</span>
      ) : null}
      <span className="min-w-0 truncate text-left">{children}</span>
    </ButtonPrimitive>
  );
}

export { PlaceholderTrigger, placeholderTriggerClassName };
