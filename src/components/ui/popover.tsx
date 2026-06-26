"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type * as React from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";

import { Drawer, DrawerContent } from "@/components/ui/drawer.tsx";
import {
  asClassName,
  DrawerMenuTrigger,
  MenuDrawerRoot,
  MenuPresentationProvider,
  useMenuRoot,
  useResolvedMenuPresentation,
  withoutWidthClasses,
} from "@/components/ui/menu-presentation.tsx";
import { cn } from "@/lib/utils.ts";

function Popover({ children, ...props }: PopoverPrimitive.Root.Props) {
  const presentation = useResolvedMenuPresentation();

  if (presentation === "drawer") {
    return (
      <MenuDrawerRoot
        defaultOpen={props.defaultOpen}
        onOpenChange={
          props.onOpenChange as ((open: boolean) => void) | undefined
        }
        open={props.open}
      >
        {children as ReactNode}
      </MenuDrawerRoot>
    );
  }

  return (
    <PopoverPrimitive.Root data-slot="popover" {...props}>
      {children}
    </PopoverPrimitive.Root>
  );
}

function PopoverTrigger({
  children,
  className,
  onClick,
  render,
  ...props
}: PopoverPrimitive.Trigger.Props & { render?: ReactElement }) {
  const root = useMenuRoot();

  if (root) {
    return (
      <DrawerMenuTrigger
        className={asClassName(className)}
        onClick={onClick as (event: MouseEvent<HTMLElement>) => void}
        render={render}
      >
        {children as ReactNode}
      </DrawerMenuTrigger>
    );
  }

  return (
    <PopoverPrimitive.Trigger
      className={className}
      data-slot="popover-trigger"
      onClick={onClick}
      render={render}
      {...props}
    >
      {children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  anchor,
  initialFocus = false,
  finalFocus = false,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  >) {
  const root = useMenuRoot();

  if (root) {
    return (
      <Drawer onOpenChange={root.setOpen} open={root.open}>
        <DrawerContent
          className={withoutWidthClasses(asClassName(className))}
          hasTitle={false}
          variant="menu"
        >
          <MenuPresentationProvider close={() => root.setOpen(false)}>
            {children as ReactNode}
          </MenuPresentationProvider>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50 overflow-visible"
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "overlay-popover-surface z-50 flex w-72 flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-popover-foreground text-sm shadow-md outline-hidden ring-1 ring-foreground/10",
            className
          )}
          data-slot="popover-content"
          finalFocus={finalFocus}
          initialFocus={initialFocus}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      data-slot="popover-header"
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  const root = useMenuRoot();
  if (root) {
    return (
      <div
        className={cn("font-medium", className)}
        data-slot="popover-title"
        {...(props as React.ComponentProps<"div">)}
      />
    );
  }
  return (
    <PopoverPrimitive.Title
      className={cn("font-medium", className)}
      data-slot="popover-title"
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  const root = useMenuRoot();
  if (root) {
    return (
      <p
        className={cn("text-muted-foreground", className)}
        data-slot="popover-description"
        {...(props as React.ComponentProps<"p">)}
      />
    );
  }
  return (
    <PopoverPrimitive.Description
      className={cn("text-muted-foreground", className)}
      data-slot="popover-description"
      {...props}
    />
  );
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
