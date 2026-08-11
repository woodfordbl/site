"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { ComponentProps, ReactNode } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { cn } from "@/lib/utils.ts";

export const settingsItemRowClassName =
  "rounded-none border-0 border-border border-b last:border-b-0";

interface SettingsItemCardProps {
  children: ReactNode;
  className?: string;
}

export function SettingsItemCard({
  children,
  className,
}: SettingsItemCardProps) {
  return (
    <ItemGroup
      className={cn(
        "gap-0 overflow-hidden rounded-lg border border-border bg-card",
        className
      )}
    >
      {children}
    </ItemGroup>
  );
}

type SettingsItemRowProps = ComponentProps<typeof Item>;

export function SettingsItemRow({
  className,
  variant = "outline",
  ...props
}: SettingsItemRowProps) {
  return (
    <Item
      className={cn(settingsItemRowClassName, className)}
      variant={variant}
      {...props}
    />
  );
}

interface SettingsItemFieldProps {
  action: ReactNode;
  /**
   * Optional body under the title/action row, for settings whose effect needs
   * showing rather than describing (a live preview). The row keeps its own
   * layout; children stack beneath it inside the same item.
   */
  children?: ReactNode;
  description: string;
  title: string;
}

export function SettingsItemField({
  action,
  children,
  description,
  title,
}: SettingsItemFieldProps) {
  const row = (
    <SettingsItemRow>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>{action}</ItemActions>
    </SettingsItemRow>
  );
  if (children === undefined) {
    return row;
  }
  return (
    <div className="flex flex-col">
      {row}
      {/* Horizontal padding MUST match `settingsItemRowClassName`'s, or the
          body sits a few px off the title and description above it. The top
          padding adds to the row's own, separating the body from the
          description rather than letting them run together. */}
      <div className="px-3 pt-2 pb-3">{children}</div>
    </div>
  );
}

type SettingsItemButtonProps = ComponentProps<typeof Button>;

export function SettingsItemButton({
  size = "sm",
  type = "button",
  variant = "outline",
  ...props
}: SettingsItemButtonProps) {
  return <Button size={size} type={type} variant={variant} {...props} />;
}

interface SettingsItemSelectOption<T extends string> {
  label: string;
  leading?: ReactNode;
  value: T;
}

interface SettingsItemSelectProps<T extends string> {
  onValueChange: (value: T) => void;
  options: SettingsItemSelectOption<T>[];
  value: T;
}

export function SettingsItemSelect<T extends string>({
  onValueChange,
  options,
  value,
}: SettingsItemSelectProps<T>) {
  const selectedOption = options.find((option) => option.value === value);
  const selectedLabel = selectedOption?.label ?? value;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            {selectedOption?.leading}
            {selectedLabel}
            <IconChevronDown className="stroke-[1.5px]" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          onValueChange={(nextValue) => {
            onValueChange(nextValue as T);
          }}
          value={value}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.leading}
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
