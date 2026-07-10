import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils.ts";

const kbdVariants = cva(
  "pointer-events-none inline-flex select-none items-center justify-center gap-1 font-normal font-sans text-xs [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        outline: cn(
          "h-5 min-w-5 rounded-[4px] border border-border bg-background px-1.5 text-foreground shadow-[0_1px_0_0_var(--border)]",
          "in-data-[slot=tooltip-content]:border-background/20 in-data-[slot=tooltip-content]:bg-background/10 in-data-[slot=tooltip-content]:text-background/90 in-data-[slot=tooltip-content]:shadow-none"
        ),
        default: cn(
          "h-5 min-w-5 rounded-[4px] bg-muted px-1.5 text-muted-foreground",
          "in-data-[slot=button]:bg-current/10 in-data-[slot=button]:text-inherit"
        ),
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  }
);

function Kbd({
  className,
  variant = "outline",
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
    <div
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="kbd-group"
      role="group"
      {...props}
    />
  );
}

export { Kbd, KbdGroup, kbdVariants };
