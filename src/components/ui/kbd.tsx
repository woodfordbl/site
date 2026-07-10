import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils.ts";

const kbdVariants = cva(
  "pointer-events-none inline-flex select-none items-center justify-center gap-1 text-xs [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        chip: cn(
          "h-5 min-w-5 rounded-sm bg-muted px-1 font-medium font-sans text-muted-foreground",
          "in-data-[slot=tooltip-content]:h-auto in-data-[slot=tooltip-content]:min-h-0 in-data-[slot=tooltip-content]:w-fit in-data-[slot=tooltip-content]:min-w-0 in-data-[slot=tooltip-content]:rounded-none in-data-[slot=tooltip-content]:bg-transparent in-data-[slot=tooltip-content]:px-0 in-data-[slot=tooltip-content]:font-normal in-data-[slot=tooltip-content]:text-background/60"
        ),
        plain:
          "h-auto min-w-0 rounded-none bg-transparent px-0 font-mono font-normal text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "chip",
    },
  }
);

function Kbd({
  className,
  variant = "chip",
  ...props
}: React.ComponentProps<"kbd"> & VariantProps<typeof kbdVariants>) {
  return (
    <kbd
      className={cn(kbdVariants({ variant }), className)}
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

export { Kbd, KbdGroup, kbdVariants };
