"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils.ts";

/** Root — controlled via `value` / `onValueChange`, same as base-ui. */
function Select(props: SelectPrimitive.Root.Props<string>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

/** Input-styled trigger with a trailing chevron; renders the selected value. */
function SelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-input/30 px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-popup-open:border-ring md:text-sm dark:bg-input/30",
        className
      )}
      data-slot="select-trigger"
      {...props}
    >
      <span className="min-w-0 truncate text-left">{children}</span>
      <SelectPrimitive.Icon className="shrink-0 text-muted-foreground">
        <IconChevronDown className="size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/** Renders the currently selected value; accepts a function child. */
function SelectValue(props: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

/** Portalled popup surface, anchored to and matching the trigger width. */
function SelectContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: SelectPrimitive.Popup.Props & { sideOffset?: number }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align="start"
        className="isolate z-50 outline-none"
        side="bottom"
        sideOffset={sideOffset}
      >
        <SelectPrimitive.Popup
          className={cn(
            "overlay-popover-surface z-50 max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10",
            className
          )}
          data-slot="select-content"
          {...props}
        >
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

/** One selectable row, with a trailing check on the active value. */
function SelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50",
        className
      )}
      data-slot="select-item"
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
