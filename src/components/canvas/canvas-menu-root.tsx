"use client";

import {
  useCanvasMenu,
  useCanvasSlashSession,
} from "@/components/canvas/canvas-menu-context.tsx";
import { CanvasMenuSlashContent } from "@/components/canvas/canvas-menu-slash-content.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";

export function CanvasMenuRoot() {
  const { open, payload } = useCanvasMenu();
  const { slashAnchorRef, slashSession } = useCanvasSlashSession();

  const isSlash = payload?.kind === "slash";

  return (
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
  );
}
