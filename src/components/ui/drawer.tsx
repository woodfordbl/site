"use client";

import type * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils.ts";

type DrawerVariant = "auto" | "menu";

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

/**
 * A drawer nested inside another drawer. vaul scales the parent drawer back and
 * stacks this one on top (parent stays mounted, dimmed behind). Used by menu
 * submenus so each level opens as its own drawer rather than a slide-over
 * screen.
 */
function DrawerNestedRoot({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.NestedRoot>) {
  return <DrawerPrimitive.NestedRoot data-slot="drawer-nested" {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/20 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  showHandle = true,
  variant = "auto",
  hasTitle = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  showHandle?: boolean;
  /**
   * "auto" hugs its content (default, current behavior). "menu" makes the
   * drawer take up most of the screen — used by menus/popovers adapted to
   * touch so action lists and pickers get a tall, scrollable surface.
   */
  variant?: DrawerVariant;
  /**
   * When false, render a visually hidden `DrawerTitle` so vaul's accessibility
   * requirement is satisfied for drawers whose content has no explicit title.
   */
  hasTitle?: boolean;
}) {
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        className={cn(
          "group/drawer-content fixed z-50 flex flex-col bg-popover bg-clip-padding text-popover-foreground",
          "inset-x-0 bottom-0 rounded-t-2xl border-t",
          variant === "menu"
            ? "mt-12 h-[88svh] max-h-[88svh]"
            : "mt-24 h-auto max-h-[85svh]",
          "pb-[env(safe-area-inset-bottom)]",
          className
        )}
        data-slot="drawer-content"
        data-variant={variant}
        {...props}
      >
        {hasTitle ? null : <DrawerTitle className="sr-only">Menu</DrawerTitle>}
        {showHandle ? (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
        ) : null}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 p-4 text-center md:text-left",
        className
      )}
      data-slot="drawer-header"
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      data-slot="drawer-footer"
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn(
        "cn-font-heading font-medium text-base text-foreground",
        className
      )}
      data-slot="drawer-title"
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
