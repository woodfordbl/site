"use client";

import { type KeyboardEvent, type ReactNode, useEffect, useRef } from "react";

import { InputGroup, InputGroupInput } from "@/components/ui/input-group.tsx";
import { InputGroupIconPicker } from "@/components/ui/input-group-icon-picker.tsx";

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

export interface MenuOpenChangeDetails {
  cancel: () => void;
  event: Event;
  reason: string;
}

/**
 * Nested GlyphIconPicker portals outside the menu popup. Cancel outside-press
 * / focus-out dismissals that land in the picker so both surfaces stay open.
 * Returns true when the close was canceled.
 */
export function shouldCancelMenuCloseForIconPicker(
  nextOpen: boolean,
  iconPickerOpen: boolean,
  eventDetails?: MenuOpenChangeDetails
): boolean {
  if (
    nextOpen ||
    !iconPickerOpen ||
    !eventDetails ||
    (eventDetails.reason !== "outsidePress" &&
      eventDetails.reason !== "focusOut")
  ) {
    return false;
  }

  const candidate =
    eventDetails.reason === "focusOut" &&
    eventDetails.event instanceof FocusEvent
      ? eventDetails.event.relatedTarget
      : eventDetails.event.target;
  if (
    candidate instanceof Element &&
    candidate.closest('[data-slot="popover-content"]')
  ) {
    eventDetails.cancel();
    return true;
  }
  return false;
}

export interface MenuIconRenameInputProps {
  ariaLabelIcon: string;
  ariaLabelName: string;
  draftName: string;
  /** Shown when `icon` is unset (field-type glyph, database cylinder, etc.). */
  fallbackIcon: ReactNode;
  icon?: string;
  iconPickerOpen: boolean;
  onCommit?: () => void;
  onDraftNameChange: (name: string) => void;
  onIconPickerOpenChange: (open: boolean) => void;
  onIconRemove?: () => void;
  onIconSelect: (icon: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}

/**
 * Shared menu-top rename row: InputGroup with a GlyphIconPicker trigger in the
 * leading addon and an autofocused name field. Used by database settings,
 * column menus, and sidebar page/database overflow menus.
 */
export function MenuIconRenameInput({
  ariaLabelIcon,
  ariaLabelName,
  draftName,
  fallbackIcon,
  icon,
  iconPickerOpen,
  onCommit,
  onDraftNameChange,
  onIconPickerOpenChange,
  onIconRemove,
  onIconSelect,
  onSubmit,
  placeholder,
}: MenuIconRenameInputProps): ReactNode {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="p-1 pb-2">
      <InputGroup className="h-8 pointer-coarse:h-10">
        <InputGroupIconPicker
          ariaLabel={ariaLabelIcon}
          fallbackIcon={fallbackIcon}
          icon={icon}
          onOpenChange={onIconPickerOpenChange}
          onRemove={onIconRemove}
          onSelect={onIconSelect}
          open={iconPickerOpen}
        />
        <InputGroupInput
          aria-label={ariaLabelName}
          autoComplete="off"
          onBlur={onCommit}
          onChange={(event) => {
            onDraftNameChange(event.target.value);
          }}
          onKeyDown={(event) => {
            stopMenuKeys(event);
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          value={draftName}
        />
      </InputGroup>
    </div>
  );
}
