"use client";

import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useRef } from "react";

import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import {
  InputGroupAddon,
  InputGroupButton,
} from "@/components/ui/input-group.tsx";
import { ensurePageIconPickerReady } from "@/lib/pages/preload-page-icon-picker.ts";
import { cn } from "@/lib/utils.ts";

/** Hover/open fill for icon triggers on `bg-input/30` input groups — darker than ghost `muted`. */
export const inputGroupIconPickerTriggerClassName = cn(
  "cursor-pointer text-muted-foreground",
  "hover:bg-input/50 hover:text-foreground",
  "aria-expanded:bg-input/50 aria-expanded:text-foreground"
);

export interface InputGroupIconPickerProps {
  ariaLabel: string;
  /** Shown when `icon` is unset (field-type glyph, database cylinder, etc.). */
  fallbackIcon: ReactNode;
  icon?: string;
  onOpenChange: (open: boolean) => void;
  onRemove?: () => void;
  onSelect: (icon: string) => void;
  open: boolean;
}

/**
 * Leading input-group icon dropdown: addon trigger + anchored {@link GlyphIconPicker}.
 * Uses `hideTrigger` so the popover portals outside nested menus without closing them.
 */
export function InputGroupIconPicker({
  ariaLabel,
  fallbackIcon,
  icon,
  onOpenChange,
  onRemove,
  onSelect,
  open,
}: InputGroupIconPickerProps): ReactNode {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const iconDisplay = icon ? (
    <PageIconDisplay className="[&_svg]:size-4" icon={icon} />
  ) : (
    fallbackIcon
  );

  return (
    <>
      <InputGroupAddon
        align="inline-start"
        className="has-[>button]:cursor-default"
        data-slot="input-group-icon-picker"
      >
        <InputGroupButton
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={ariaLabel}
          className={inputGroupIconPickerTriggerClassName}
          onClick={() => {
            onOpenChange(true);
          }}
          onPointerEnter={() => {
            ensurePageIconPickerReady(queryClient);
          }}
          ref={triggerRef}
          size="icon-xs"
        >
          {iconDisplay}
        </InputGroupButton>
      </InputGroupAddon>
      <GlyphIconPicker
        anchor={triggerRef}
        ariaLabel={ariaLabel}
        contentAlign="start"
        contentSide="left"
        hideTrigger
        icon={icon}
        onOpenChange={onOpenChange}
        onRemove={onRemove}
        onSelect={onSelect}
        open={open}
      />
    </>
  );
}
