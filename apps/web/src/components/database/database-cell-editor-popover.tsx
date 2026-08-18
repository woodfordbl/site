import type { ReactNode } from "react";
import { useState } from "react";

import { Popover, PopoverContent } from "@/components/ui/popover.tsx";

/**
 * @fileoverview The popover shell every non-inline cell editor opens in.
 *
 * Its own module so the editors that use it (select, date, relation, location)
 * can live in their own files while still opening the same anchored surface.
 */

interface CellEditorPopoverProps {
  children: ReactNode;
  className?: string;
  onStopEdit: () => void;
}

/**
 * An invisible full-cell anchor the popover opens immediately beneath, with any
 * dismissal (Escape, outside click) exiting editing via `onStopEdit`. The
 * anchor carries no selection ring — the open popover alone marks the editing
 * cell.
 */
export function CellEditorPopover({
  children,
  className,
  onStopEdit,
}: CellEditorPopoverProps): ReactNode {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10"
        ref={setAnchor}
      />
      <Popover
        onOpenChange={(open: boolean) => {
          if (!open) {
            onStopEdit();
          }
        }}
        // Open as soon as the anchor exists so positioning never flashes.
        open={anchor !== null}
      >
        <PopoverContent
          align="start"
          anchor={anchor}
          className={className}
          side="bottom"
          sideOffset={2}
        >
          {children}
        </PopoverContent>
      </Popover>
    </>
  );
}
