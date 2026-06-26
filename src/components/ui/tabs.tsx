import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils.ts";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      data-orientation={orientation}
      data-slot="tabs"
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list relative inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground data-[variant=indicator]:rounded-none data-[variant=line]:rounded-none group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "gap-0 bg-muted",
        indicator: "gap-0 bg-transparent p-1",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "indicator",
    },
  }
);

function TabsIndicator({ className, ...props }: TabsPrimitive.Indicator.Props) {
  return (
    <TabsPrimitive.Indicator
      className={cn(
        "absolute z-0 transition-[left,width,top,height] duration-200 ease-[var(--ease-out-strong)] motion-reduce:transition-none",
        "top-[var(--active-tab-top)] left-[var(--active-tab-left)] h-[var(--active-tab-height)] w-[var(--active-tab-width)]",
        "group-data-[variant=indicator]/tabs-list:rounded-md group-data-[variant=indicator]/tabs-list:bg-muted dark:group-data-[variant=indicator]/tabs-list:bg-secondary",
        "group-data-[variant=default]/tabs-list:rounded-md group-data-[variant=default]/tabs-list:bg-background group-data-[variant=default]/tabs-list:shadow-sm dark:group-data-[variant=default]/tabs-list:border dark:group-data-[variant=default]/tabs-list:border-input dark:group-data-[variant=default]/tabs-list:bg-input/30",
        "group-data-[variant=line]/tabs-list:top-auto group-data-[variant=line]/tabs-list:bottom-0 group-data-[variant=line]/tabs-list:z-[1] group-data-[variant=line]/tabs-list:h-0.5 group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:bg-primary",
        className
      )}
      data-slot="tabs-indicator"
      {...props}
    />
  );
}

function TabsList({
  className,
  variant,
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const resolvedVariant = variant ?? "indicator";

  return (
    <TabsPrimitive.List
      className={cn(tabsListVariants({ variant: resolvedVariant }), className)}
      data-slot="tabs-list"
      data-variant={resolvedVariant}
      {...props}
    >
      <TabsIndicator />
      {children}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "relative z-10 inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-1.5 py-0.5 font-normal text-foreground/60 text-sm transition-[color,box-shadow] duration-200 ease-[var(--ease-out-strong)] hover:text-foreground focus-visible:border-ring focus-visible:outline-1 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-[variant=default]/tabs-list:bg-transparent group-data-[variant=indicator]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=default]/tabs-list:text-muted-foreground group-data-[variant=indicator]/tabs-list:text-muted-foreground group-data-[variant=default]/tabs-list:data-active:bg-transparent group-data-[variant=indicator]/tabs-list:data-active:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent group-data-[variant=default]/tabs-list:data-active:text-foreground group-data-[variant=indicator]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:text-primary group-data-[variant=default]/tabs-list:data-active:shadow-none group-data-[variant=indicator]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:data-active:shadow-none dark:text-muted-foreground dark:group-data-[variant=default]/tabs-list:data-active:text-foreground dark:group-data-[variant=indicator]/tabs-list:data-active:text-foreground dark:hover:text-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("flex-1 text-sm outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger, tabsListVariants };
