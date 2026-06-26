"use client";

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import type * as React from "react";
import { type MouseEvent, useState } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer.tsx";
import {
  asClassName,
  DrawerCheckTrailing,
  DrawerMenuRow,
  DrawerMenuSectionLabel,
  DrawerMenuSeparator,
  MenuDrawerScreen,
  MenuDrawerSubProvider,
  MenuPresentationProvider,
  MenuRadioGroupProvider,
  MenuRootProvider,
  useMenuDrawerSub,
  useMenuPresentation,
  useMenuRadioGroup,
  useMenuRoot,
  useResolvedMenuPresentation,
  withoutWidthClasses,
} from "@/components/ui/menu-presentation.tsx";
import { cn } from "@/lib/utils.ts";

function ContextMenu({ children, ...props }: ContextMenuPrimitive.Root.Props) {
  const presentation = useResolvedMenuPresentation();
  const [open, setOpen] = useState(false);

  if (presentation === "drawer") {
    // Keep the Base UI root + trigger mounted so the long-press gesture still
    // opens the menu, but mirror its open state into a drawer (no positioned
    // popup is rendered in drawer mode).
    return (
      <MenuRootProvider open={open} presentation="drawer" setOpen={setOpen}>
        <ContextMenuPrimitive.Root
          onOpenChange={(next) => setOpen(next)}
          open={open}
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Root>
      </MenuRootProvider>
    );
  }

  return (
    <ContextMenuPrimitive.Root data-slot="context-menu" {...props}>
      {children}
    </ContextMenuPrimitive.Root>
  );
}

function ContextMenuPortal({ ...props }: ContextMenuPrimitive.Portal.Props) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  );
}

function ContextMenuTrigger({
  className,
  ...props
}: ContextMenuPrimitive.Trigger.Props) {
  return (
    <ContextMenuPrimitive.Trigger
      className={cn("select-none", className)}
      data-slot="context-menu-trigger"
      {...props}
    />
  );
}

function ContextMenuContent({
  className,
  align = "start",
  alignOffset = 4,
  side = "right",
  sideOffset = 0,
  children,
  ...props
}: ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
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
            {children}
          </MenuPresentationProvider>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          className={cn(
            "overlay-popover-surface z-50 max-h-(--available-height) min-w-36 overflow-y-auto overflow-x-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
            className
          )}
          data-slot="context-menu-content"
          {...props}
        >
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuGroup({
  children,
  ...props
}: ContextMenuPrimitive.Group.Props) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <>{children}</>;
  }
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props}>
      {children}
    </ContextMenuPrimitive.Group>
  );
}

function ContextMenuLabel({
  className,
  inset,
  children,
  ...props
}: ContextMenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <DrawerMenuSectionLabel>{children}</DrawerMenuSectionLabel>;
  }
  return (
    <ContextMenuPrimitive.GroupLabel
      className={cn(
        "px-1.5 py-1 font-medium text-muted-foreground text-xs data-inset:pl-7",
        className
      )}
      data-inset={inset}
      data-slot="context-menu-label"
      {...props}
    >
      {children}
    </ContextMenuPrimitive.GroupLabel>
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  children,
  disabled,
  onClick,
  ...props
}: ContextMenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  const { presentation, close } = useMenuPresentation();

  if (presentation === "drawer") {
    return (
      <DrawerMenuRow
        destructive={variant === "destructive"}
        disabled={disabled}
        onClick={(event) => {
          (onClick as ((event: MouseEvent<HTMLElement>) => void) | undefined)?.(
            event
          );
          close();
        }}
      >
        {children}
      </DrawerMenuRow>
    );
  }

  return (
    <ContextMenuPrimitive.Item
      className={cn(
        "group/context-menu-item relative flex cursor-default select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-7 data-[variant=destructive]:text-destructive data-disabled:opacity-50 data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus:*:[svg]:text-accent-foreground data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      data-inset={inset}
      data-slot="context-menu-item"
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.Item>
  );
}

function ContextMenuSub({
  children,
  ...props
}: ContextMenuPrimitive.SubmenuRoot.Props) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <MenuDrawerSubProvider>{children}</MenuDrawerSubProvider>;
  }
  return (
    <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props}>
      {children}
    </ContextMenuPrimitive.SubmenuRoot>
  );
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  const { presentation } = useMenuPresentation();
  const sub = useMenuDrawerSub();

  if (presentation === "drawer") {
    if (sub) {
      sub.titleRef.current = children;
    }
    return (
      <DrawerMenuRow
        onClick={() => sub?.setOpen(true)}
        trailing={
          <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
        }
      >
        {children}
      </DrawerMenuRow>
    );
  }

  return (
    <ContextMenuPrimitive.SubmenuTrigger
      className={cn(
        "flex cursor-default select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-open:bg-accent data-inset:pl-7 data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-inset={inset}
      data-slot="context-menu-sub-trigger"
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto" />
    </ContextMenuPrimitive.SubmenuTrigger>
  );
}

function ContextMenuSubContent({
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuContent>) {
  const { presentation } = useMenuPresentation();
  const sub = useMenuDrawerSub();

  if (presentation === "drawer") {
    return (
      <MenuDrawerScreen
        onBack={() => sub?.setOpen(false)}
        open={sub?.open ?? false}
        title={sub?.titleRef.current}
      >
        {children}
      </MenuDrawerScreen>
    );
  }

  return (
    <ContextMenuContent
      className="shadow-lg"
      data-slot="context-menu-sub-content"
      side="right"
      {...props}
    >
      {children}
    </ContextMenuContent>
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: ContextMenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  const { presentation } = useMenuPresentation();

  if (presentation === "drawer") {
    return (
      <DrawerMenuRow
        onClick={() => props.onCheckedChange?.(!checked, undefined as never)}
        trailing={<DrawerCheckTrailing checked={Boolean(checked)} />}
      >
        {children}
      </DrawerMenuRow>
    );
  }

  return (
    <ContextMenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "relative flex cursor-default select-none items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-inset={inset}
      data-slot="context-menu-checkbox-item"
      {...props}
    >
      <span className="pointer-events-none absolute right-2">
        <ContextMenuPrimitive.CheckboxItemIndicator>
          <IconCheck />
        </ContextMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

function ContextMenuRadioGroup({
  children,
  onValueChange,
  value,
  ...props
}: ContextMenuPrimitive.RadioGroup.Props) {
  const { presentation } = useMenuPresentation();

  if (presentation === "drawer") {
    return (
      <MenuRadioGroupProvider
        setValue={(next) =>
          (onValueChange as ((value: string) => void) | undefined)?.(next)
        }
        value={typeof value === "string" ? value : undefined}
      >
        {children}
      </MenuRadioGroupProvider>
    );
  }

  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      onValueChange={onValueChange}
      value={value}
      {...props}
    >
      {children}
    </ContextMenuPrimitive.RadioGroup>
  );
}

function ContextMenuRadioItem({
  className,
  children,
  inset,
  value,
  ...props
}: ContextMenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  const { presentation, close } = useMenuPresentation();
  const group = useMenuRadioGroup();

  if (presentation === "drawer") {
    const checked = group?.value === value;
    return (
      <DrawerMenuRow
        onClick={() => {
          if (typeof value === "string") {
            group?.setValue(value);
          }
          close();
        }}
        trailing={<DrawerCheckTrailing checked={checked} />}
      >
        {children}
      </DrawerMenuRow>
    );
  }

  return (
    <ContextMenuPrimitive.RadioItem
      className={cn(
        "relative flex cursor-default select-none items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-inset={inset}
      data-slot="context-menu-radio-item"
      value={value}
      {...props}
    >
      <span className="pointer-events-none absolute right-2">
        <ContextMenuPrimitive.RadioItemIndicator>
          <IconCheck />
        </ContextMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuPrimitive.Separator.Props) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <DrawerMenuSeparator />;
  }
  return (
    <ContextMenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      data-slot="context-menu-separator"
      {...props}
    />
  );
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return null;
  }
  return (
    <span
      className={cn(
        "ml-auto text-muted-foreground text-xs tracking-widest group-focus/context-menu-item:text-accent-foreground",
        className
      )}
      data-slot="context-menu-shortcut"
      {...props}
    />
  );
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
