"use client";

import { NumberField as NumberFieldPrimitive } from "@base-ui/react/number-field";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils.ts";

/**
 * Keep typing inside a menu-embedded field from triggering the menu's
 * typeahead / arrow navigation; Escape still bubbles so it closes the menu.
 * Mirrors `stopMenuKeys` in the column menu.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

interface NumberFieldProps {
  "aria-label": string;
  className?: string;
  /** Set when the field is rendered inside a dropdown menu (default true). */
  inMenu?: boolean;
  max?: number;
  min?: number;
  onValueChange: (value: number | null) => void;
  /** Shown when empty — e.g. "Auto". */
  placeholder?: string;
  step?: number;
  /** Current value, or `null` when empty (renders the placeholder). */
  value: number | null;
}

/**
 * Compact numeric input (Base UI `NumberField`) with −/+ steppers. Empty maps to
 * `null` so callers can clear a value back to "auto". Safe to embed in a
 * dropdown menu: keypresses are kept from the menu's typeahead.
 */
export function NumberField({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  placeholder,
  className,
  inMenu = true,
  "aria-label": ariaLabel,
}: NumberFieldProps) {
  return (
    <NumberFieldPrimitive.Root
      className={cn("inline-flex", className)}
      max={max}
      min={min}
      onValueChange={(next) => onValueChange(next)}
      step={step}
      value={value}
    >
      <NumberFieldPrimitive.Group className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-background">
        <NumberFieldPrimitive.Decrement
          aria-label="Decrement"
          className="flex h-full w-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <IconMinus className="size-3.5" />
        </NumberFieldPrimitive.Decrement>
        <NumberFieldPrimitive.Input
          aria-label={ariaLabel}
          className="h-full w-10 min-w-0 border-border border-x bg-transparent text-center font-mono text-foreground text-xs tabular-nums outline-none placeholder:text-muted-foreground/70"
          onKeyDown={inMenu ? stopMenuKeys : undefined}
          placeholder={placeholder}
        />
        <NumberFieldPrimitive.Increment
          aria-label="Increment"
          className="flex h-full w-6 items-center justify-center text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <IconPlus className="size-3.5" />
        </NumberFieldPrimitive.Increment>
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}

type MenuNumberFieldProps = Omit<NumberFieldProps, "aria-label" | "inMenu"> & {
  label: string;
};

/** A labeled `NumberField` row sized for dropdown-menu submenus. */
export function MenuNumberField({
  label,
  className,
  ...props
}: MenuNumberFieldProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-1.5 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <NumberField aria-label={label} className={className} {...props} />
    </div>
  );
}
