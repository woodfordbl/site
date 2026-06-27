"use client";

import { createPortal } from "react-dom";

import { getSlashMenuItems } from "@/components/blocks/registry.ts";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import type { SlashMenuItem } from "@/lib/canvas/block-spec.types.ts";
import { cn } from "@/lib/utils.ts";

const pickerItemClassName =
  "flex w-full cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground active:bg-selection [&_svg:not([class*='size-'])]:size-5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

interface MobileBlockTypePickerProps {
  onOpenChange: (open: boolean) => void;
  onSelect: (item: SlashMenuItem) => void;
  open: boolean;
  title: string;
}

/**
 * Bottom-sheet list of block types, shared by the mobile toolbar's "Add block"
 * and "Turn into" actions. Reuses {@link getSlashMenuItems} (the same source the
 * desktop slash menu and gutter "Turn into" use).
 */
export function MobileBlockTypePicker({
  onOpenChange,
  onSelect,
  open,
  title,
}: MobileBlockTypePickerProps) {
  const items = getSlashMenuItems();

  return (
    <>
      {typeof document === "undefined"
        ? null
        : createPortal(
            <div
              aria-hidden
              className={cn(
                "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 supports-backdrop-filter:backdrop-blur-xs",
                open ? "opacity-100" : "pointer-events-none opacity-0"
              )}
              onClick={() => onOpenChange(false)}
            />,
            document.body
          )}
      <Drawer modal={false} onOpenChange={onOpenChange} open={open}>
        <DrawerContent
          hasTitle
          // Let the editor's pending focus land on the new/converted block instead
          // of vaul restoring focus to the trigger (which would keep the keyboard
          // closed after picking).
          onCloseAutoFocus={(event) => event.preventDefault()}
          variant="menu"
        >
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1" viewportClassName="px-2 pb-4">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={pickerItemClassName}
                  key={item.key}
                  // The toolbar closes the picker (via `open`) before running the
                  // edit, so the sheet still dismisses even if the edit throws.
                  onClick={() => onSelect(item)}
                  type="button"
                >
                  <Icon />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              );
            })}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </>
  );
}
