import type { ObjectContainContentBounds } from "@/lib/dom/object-contain-bounds.ts";

export const MEDIA_RESIZE_HANDLE_INSET_PX = 8;

export function mediaResizeHandlePosition(
  side: "left" | "right",
  bounds: ObjectContainContentBounds
): { left: number; top: number; transform: string } {
  const centerY = bounds.top + bounds.height / 2;
  const insetEdge =
    side === "left"
      ? bounds.left + MEDIA_RESIZE_HANDLE_INSET_PX
      : bounds.left + bounds.width - MEDIA_RESIZE_HANDLE_INSET_PX;

  return {
    top: centerY,
    left: insetEdge,
    transform: "translate(-50%, -50%)",
  };
}

/** Top-right overlay actions, inset to match {@link mediaResizeHandlePosition}. */
export function mediaHoverToolbarPosition(bounds: ObjectContainContentBounds): {
  left: number;
  top: number;
  transform: string;
} {
  return {
    top: bounds.top + MEDIA_RESIZE_HANDLE_INSET_PX,
    left: bounds.left + bounds.width - MEDIA_RESIZE_HANDLE_INSET_PX,
    transform: "translateX(-100%)",
  };
}
