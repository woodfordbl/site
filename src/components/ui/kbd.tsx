import { cn } from "@/lib/utils.ts";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 in-data-[slot=tooltip-content]:h-auto in-data-[slot=tooltip-content]:min-h-0 w-fit in-data-[slot=tooltip-content]:min-w-0 min-w-5 select-none items-center justify-center gap-1 in-data-[slot=tooltip-content]:rounded-none rounded-sm bg-muted in-data-[slot=tooltip-content]:bg-transparent in-data-[slot=tooltip-content]:px-0 px-1 font-medium font-sans in-data-[slot=tooltip-content]:font-normal in-data-[slot=tooltip-content]:text-background/60 text-muted-foreground text-xs [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      data-slot="kbd"
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
