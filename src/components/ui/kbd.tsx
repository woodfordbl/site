import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils.ts";

const kbdVariants = cva(
  "pointer-events-none inline-flex select-none items-center justify-center gap-1 font-normal font-sans text-[11px] leading-none [&_svg:not([class*='size-'])]:size-2.5",
  {
    variants: {
      variant: {
        outline:
          "h-4 min-w-4 rounded-[3px] border border-border bg-background px-1 text-foreground",
        default: cn(
          "h-4 min-w-4 rounded-[3px] bg-muted px-1 text-muted-foreground",
          "in-data-[slot=button]:bg-current/10 in-data-[slot=button]:text-inherit"
        ),
        inherit: "text-inherit opacity-50",
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
