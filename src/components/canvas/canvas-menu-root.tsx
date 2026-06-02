"use client";

import { useEffect } from "react";
import { useCanvasEditorContext } from "@/components/canvas/canvas-editor-context.tsx";
import { CanvasMenuBlockActions } from "@/components/canvas/canvas-menu-block-actions.tsx";
import { useCanvasMenu } from "@/components/canvas/canvas-menu-context.tsx";
import { CanvasMenuSlashContent } from "@/components/canvas/canvas-menu-slash-content.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";

function useDismissBlockActionsMenu() {
  const { closeMenu, open, payload } = useCanvasMenu();
  const { clearSelection } = useCanvasEditorContext();

  useEffect(() => {
    if (!open || payload?.kind !== "block-actions") {
      return;
    }

    const dismiss = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-canvas-row-menu]")) {
        return;
      }
      if (target.closest("[data-canvas-row-select]")) {
        return;
      }
      closeMenu();
      clearSelection();
    };

    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss, true);
    };
  }, [clearSelection, closeMenu, open, payload]);
}

export function CanvasMenuRoot() {
  const {
    closeMenu,
    handle,
    open,
    payload,
    slashAnchorRef,
    slashSession,
    triggerId,
  } = useCanvasMenu();

  useDismissBlockActionsMenu();

  const isSlash = payload?.kind === "slash";
  const isBlockActions = payload?.kind === "block-actions";

  return (
    <>
      <Popover
        onOpenChange={(nextOpen) => {
          if (isSlash) {
            slashSession?.onPopoverOpenChange(nextOpen);
          }
        }}
        open={open && isSlash}
      >
        <PopoverContent
          align="start"
          anchor={slashAnchorRef}
          className="w-72 gap-0 p-0 duration-0 data-closed:animate-none data-closed:duration-0"
          finalFocus={false}
          initialFocus={false}
          side="bottom"
        >
          {isSlash ? <CanvasMenuSlashContent key={payload.rowId} /> : null}
        </PopoverContent>
      </Popover>

      <DropdownMenu
        handle={handle}
        modal={false}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeMenu();
          }
        }}
        open={open && isBlockActions}
        triggerId={triggerId}
      >
        <DropdownMenuContent
          align="center"
          className="min-w-64 duration-0 data-closed:animate-none data-closed:duration-0"
          data-canvas-row-menu
          finalFocus={false}
          side="left"
        >
          {isBlockActions ? <CanvasMenuBlockActions /> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
