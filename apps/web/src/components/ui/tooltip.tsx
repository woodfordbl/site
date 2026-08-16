"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { useIsCoarsePrimaryPointer } from "@/components/layout/device-layout-provider.tsx";
import { SequenceShortcut, Shortcut } from "@/components/ui/shortcut.tsx";
import type {
  CommandId,
  SequenceCommandId,
} from "@/lib/settings/keyboard-commands.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Tooltips delay before the first open (no accidental flashes); adjacent
 * tooltips within `timeout` open instantly and skip the animation via
 * Base UI's `data-instant`.
 */
function TooltipProvider({
  delay = 600,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  );
}

const Tooltip = TooltipPrimitive.Root;

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

type TooltipShortcutProps =
  | {
      command?: CommandId;
      sequence?: never;
    }
  | {
      command?: never;
      sequence?: SequenceCommandId;
    };

/**
 * Tooltip popup surface. Styling is driven by `html[data-tooltip-style]`:
 * - `normal` (default) — `bg-popover` / `text-popover-foreground`
 * - `inverted` — opposite of page chrome (`bg-foreground` / `text-background`)
 *
 * No border, outline, or ring — soft `shadow-md` only. Nested keycaps inherit
 * filled `Kbd` chrome (no outline islands).
 */
function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  anchor,
  showArrow = false,
  command,
  sequence,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  > & {
    showArrow?: boolean;
    /**
     * Appends the live keybinding for this command as `<Kbd>` chips, kept in
     * sync with the user's current binding via the keybindings store.
     */
  } & TooltipShortcutProps) {
  // Touch devices have no hover affordance and shortcuts are irrelevant there,
  // so suppress all tooltip popups on a coarse primary pointer.
  const isCoarsePointer = useIsCoarsePrimaryPointer();
  if (isCoarsePointer) {
    return null;
  }

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          className={cn(
            "overlay-popover-surface z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-popover px-3 py-1.5 font-normal text-popover-foreground text-xs shadow-md has-data-[slot=kbd]:pr-1.5",
            // Inverted = opposite of page chrome (dark in light mode, light in dark).
            "in-[[data-tooltip-style=inverted]]:bg-foreground in-[[data-tooltip-style=inverted]]:text-background",
            // Filled keycaps stay readable on inverted surfaces; skip inherit (text-only).
            "in-[[data-tooltip-style=inverted]]:**:data-[slot=kbd]:data-[variant=outline]:bg-background/20 in-[[data-tooltip-style=inverted]]:**:data-[slot=kbd]:data-[variant=outline]:text-inherit",
            "in-[[data-tooltip-style=inverted]]:**:data-[slot=kbd]:data-[variant=default]:bg-background/20 in-[[data-tooltip-style=inverted]]:**:data-[slot=kbd]:data-[variant=default]:text-inherit",
            "in-[[data-tooltip-style=inverted]]:**:data-[slot=sequence-shortcut]>span:text-background/60",
            // Interruptible enter/exit from the trigger; instant for adjacent tooltips.
            "transition-[opacity,scale] duration-[125ms] ease-[var(--ease-out-strong)]",
            "data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0",
            "data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[ending-style]:duration-100",
            "data-[instant]:duration-0",
            "motion-reduce:transition-opacity motion-reduce:data-[ending-style]:scale-100 motion-reduce:data-[starting-style]:scale-100",
            className
          )}
          data-slot="tooltip-content"
          {...props}
        >
          {children}
          {command ? <Shortcut command={command} /> : null}
          {sequence ? <SequenceShortcut sequenceId={sequence} /> : null}
          {showArrow ? (
            <TooltipPrimitive.Arrow
              className={cn(
                "z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-popover fill-popover data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-start]:top-1/2! data-[side=left]:top-1/2! data-[side=right]:top-1/2! data-[side=inline-start]:-right-1 data-[side=left]:-right-1 data-[side=top]:-bottom-2.5 data-[side=inline-end]:-left-1 data-[side=right]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:-translate-y-1/2 data-[side=right]:-translate-y-1/2",
                "in-[[data-tooltip-style=inverted]]:bg-foreground in-[[data-tooltip-style=inverted]]:fill-foreground"
              )}
            />
          ) : null}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
