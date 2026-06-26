"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import type * as React from "react";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { Drawer, DrawerContent } from "@/components/ui/drawer.tsx";
import {
  asClassName,
  DrawerCheckTrailing,
  DrawerMenuRow,
  DrawerMenuSectionLabel,
  DrawerMenuSeparator,
  DrawerMenuTrigger,
  MenuDrawerRoot,
  MenuDrawerSubDrawer,
  MenuDrawerSubProvider,
  MenuPresentationProvider,
  MenuRadioGroupProvider,
  useMenuDrawerSub,
  useMenuPresentation,
  useMenuRadioGroup,
  useMenuRoot,
  useResolvedMenuPresentation,
  withoutWidthClasses,
} from "@/components/ui/menu-presentation.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";

type DropdownMenuHandle<Payload = unknown> = ReturnType<
  typeof MenuPrimitive.createHandle<Payload>
>;

function createDropdownMenuHandle<
  Payload = unknown,
>(): DropdownMenuHandle<Payload> {
  return MenuPrimitive.createHandle<Payload>();
}

function DropdownMenu({ children, ...props }: MenuPrimitive.Root.Props) {
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
    <MenuPrimitive.Root data-slot="dropdown-menu" {...props}>
      {children}
    </MenuPrimitive.Root>
  );
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({
  className,
  children,
  onClick,
  render,
  ...props
}: MenuPrimitive.Trigger.Props & { render?: ReactElement }) {
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
    <MenuPrimitive.Trigger
      className={className}
      data-slot="dropdown-menu-trigger"
      onClick={onClick}
      render={render}
      {...props}
    >
      {children}
    </MenuPrimitive.Trigger>
  );
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  anchor,
  side = "bottom",
  sideOffset = 4,
  className,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
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
            {children}
          </MenuPresentationProvider>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50 outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          className={cn(
            "overlay-popover-surface z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md outline-none ring-1 ring-foreground/10 data-closed:overflow-hidden",
            className
          )}
          data-slot="dropdown-menu-content"
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ children, ...props }: MenuPrimitive.Group.Props) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <>{children}</>;
  }
  return (
    <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props}>
      {children}
    </MenuPrimitive.Group>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <DrawerMenuSectionLabel>{children}</DrawerMenuSectionLabel>;
  }
  return (
    <MenuPrimitive.GroupLabel
      className={cn(
        "px-1.5 py-1 font-medium text-muted-foreground text-xs data-inset:pl-7",
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-label"
      {...props}
    >
      {children}
    </MenuPrimitive.GroupLabel>
  );
}

function DropdownMenuItem({
  className,
  highlighted,
  inset,
  variant = "default",
  children,
  closeOnClick,
  disabled,
  onClick,
  render,
  ...props
}: MenuPrimitive.Item.Props & {
  highlighted?: boolean;
  inset?: boolean;
  render?: ReactElement;
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
          if (closeOnClick !== false) {
            close();
          }
        }}
        render={render}
      >
        {children}
      </DrawerMenuRow>
    );
  }

  return (
    <MenuPrimitive.Item
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default select-none items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden focus:bg-accent not-data-[variant=destructive]:focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-[variant=destructive]:data-highlighted:text-destructive data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:pl-7 not-data-[variant=destructive]:data-highlighted:text-accent-foreground data-disabled:opacity-50 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:hover:text-destructive [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:data-highlighted:[&_svg]:text-destructive data-[variant=destructive]:focus:[&_svg]:text-destructive data-[variant=destructive]:hover:[&_svg]:text-destructive",
        className
      )}
      closeOnClick={closeOnClick}
      data-highlighted={highlighted ? "" : undefined}
      data-inset={inset}
      data-slot="dropdown-menu-item"
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
      render={render}
      {...props}
    >
      {children}
    </MenuPrimitive.Item>
  );
}

function DropdownMenuSub({
  children,
  ...props
}: MenuPrimitive.SubmenuRoot.Props) {
  const { presentation } = useMenuPresentation();

  if (presentation === "drawer") {
    return <MenuDrawerSubProvider>{children}</MenuDrawerSubProvider>;
  }

  return (
    <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props}>
      {children}
    </MenuPrimitive.SubmenuRoot>
  );
}

function DropdownMenuSubTrigger({
  className,
  highlighted,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  highlighted?: boolean;
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
    <MenuPrimitive.SubmenuTrigger
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-highlighted:bg-accent data-open:bg-accent data-popup-open:bg-accent data-inset:pl-7 data-highlighted:text-accent-foreground data-open:text-accent-foreground data-popup-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-highlighted={highlighted ? "" : undefined}
      data-inset={inset}
      data-slot="dropdown-menu-sub-trigger"
      openOnHover
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  const { presentation } = useMenuPresentation();
  const sub = useMenuDrawerSub();

  if (presentation === "drawer") {
    return (
      <MenuDrawerSubDrawer
        onOpenChange={(next) => sub?.setOpen(next)}
        open={sub?.open ?? false}
        title={sub?.titleRef.current}
      >
        {children}
      </MenuDrawerSubDrawer>
    );
  }

  return (
    <DropdownMenuContent
      align={align}
      alignOffset={alignOffset}
      className={cn(
        "overlay-popover-surface w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
        className
      )}
      data-slot="dropdown-menu-sub-content"
      side={side}
      sideOffset={sideOffset}
      {...props}
    >
      {children}
    </DropdownMenuContent>
  );
}

function DropdownMenuSwitchItem({
  checked,
  children,
  className,
  disabled,
  onCheckedChange,
  onClick,
  ...props
}: Omit<MenuPrimitive.Item.Props, "children"> & {
  checked: boolean;
  children: React.ReactNode;
  onCheckedChange: (checked: boolean) => void;
}) {
  const { presentation } = useMenuPresentation();

  if (presentation === "drawer") {
    return (
      <DrawerMenuRow
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        trailing={
          <Switch
            checked={checked}
            className="pointer-events-none"
            disabled={disabled}
            size="sm"
            tabIndex={-1}
          />
        }
      >
        {children}
      </DrawerMenuRow>
    );
  }

  return (
    <MenuPrimitive.Item
      aria-checked={checked}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default select-none items-center justify-between gap-3 rounded-md px-1.5 py-1 text-sm outline-hidden focus:bg-accent not-data-[variant=destructive]:focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:pl-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      closeOnClick={false}
      data-slot="dropdown-menu-switch-item"
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || disabled) {
          return;
        }
        onCheckedChange(!checked);
      }}
      {...props}
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      <Switch
        checked={checked}
        className="pointer-events-none"
        disabled={disabled}
        size="sm"
        tabIndex={-1}
      />
    </MenuPrimitive.Item>
  );
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
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
    <MenuPrimitive.CheckboxItem
      checked={checked}
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-checkbox-item"
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <IconCheck />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({
  children,
  onValueChange,
  value,
  ...props
}: MenuPrimitive.RadioGroup.Props) {
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
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      onValueChange={onValueChange}
      value={value}
      {...props}
    >
      {children}
    </MenuPrimitive.RadioGroup>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  value,
  ...props
}: MenuPrimitive.RadioItem.Props & {
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
    <MenuPrimitive.RadioItem
      className={cn(
        "relative flex cursor-default select-none items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-disabled:pointer-events-none data-inset:pl-7 data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      data-inset={inset}
      data-slot="dropdown-menu-radio-item"
      value={value}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <IconCheck />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  const { presentation } = useMenuPresentation();
  if (presentation === "drawer") {
    return <DrawerMenuSeparator />;
  }
  return (
    <MenuPrimitive.Separator
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      data-slot="dropdown-menu-separator"
      {...props}
    />
  );
}

function DropdownMenuShortcut({
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
        "ml-auto text-muted-foreground text-xs tracking-widest group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      data-slot="dropdown-menu-shortcut"
      {...props}
    />
  );
}

export type { DropdownMenuHandle };
export {
  createDropdownMenuHandle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuTrigger,
};
