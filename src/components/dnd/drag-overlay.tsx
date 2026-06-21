import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDragState } from "@/components/dnd/use-dnd.ts";
import type { DragPointer } from "@/lib/dnd/drag-store.ts";

/**
 * Portals a follow-the-pointer drag preview to `document.body` while a drag is
 * active. The render prop receives the dragging id and live pointer so the
 * surface can position its own preview content.
 * @see docs/architecture/drag-and-drop.md
 */
export function DragOverlay({
  children,
}: {
  children: (args: { draggingId: string; pointer: DragPointer }) => ReactNode;
}) {
  const draggingId = useDragState((state) => state.draggingId);
  const pointer = useDragState((state) => state.pointer);

  if (draggingId == null || pointer == null) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-9999">
      {children({ draggingId, pointer })}
    </div>,
    document.body
  );
}
