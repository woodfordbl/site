import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";

export type ListReorderAxis = "horizontal" | "vertical";

export interface UseListReorderOptions {
  /** Default `vertical` (Properties list). Use `horizontal` for chip strips. */
  axis?: ListReorderAxis;
}

/**
 * Pointer-driven list reorder for a small, self-contained list (e.g. the
 * database Properties list or sort chips) rendered inside a popover, drawer,
 * or inline chip bar.
 *
 * It deliberately does not use the canvas DnD toolkit: those surfaces need a
 * `DndSurface` context with registered rects, which a portaled menu/submenu
 * doesn't have. Instead a drag handle captures the pointer and the drop slot is
 * derived live from the rows' own bounding rects — so the same code path works
 * for mouse (desktop popover) and touch (mobile drawer).
 *
 * Rows must be tagged with `data-reorder-item` so their rects can be measured
 * in visual order.
 */
export interface ListReorderDragPreview {
  clientX: number;
  clientY: number;
  offsetX: number;
  offsetY: number;
  width: number;
}

export interface ListReorderState {
  /** Index of the row being dragged, or null when idle. */
  fromIndex: number | null;
  /** Insertion slot under the pointer (0..count), or null when idle. */
  overIndex: number | null;
  /** Live pointer position for a follow-the-finger drag preview, or null when idle. */
  preview: ListReorderDragPreview | null;
}

export interface ListReorderHandleProps {
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface UseListReorderResult {
  /** Spread onto the element wrapping the reorderable rows. */
  containerRef: (node: HTMLElement | null) => void;
  /** Spread onto each row's drag handle; `index` is the row's position. */
  getHandleProps: (index: number) => ListReorderHandleProps;
  state: ListReorderState;
}

const IDLE: ListReorderState = {
  fromIndex: null,
  overIndex: null,
  preview: null,
};

/**
 * Maps a pointer's insertion slot (0..count, measured in the pre-removal list)
 * to the destination index the item lands at once it is lifted out of `from`:
 * every slot past the removed row shifts down one. Returns `from` for a no-op
 * (dropping onto the item's own leading or trailing boundary).
 */
export function resolveReorderTarget(from: number, overSlot: number): number {
  return overSlot > from ? overSlot - 1 : overSlot;
}

/**
 * @param onReorder Commits a move of the item at `from` to `to` (both final,
 *   post-removal indices). Never called for a no-op move.
 */
export function useListReorder(
  onReorder: (from: number, to: number) => void,
  options?: UseListReorderOptions
): UseListReorderResult {
  const axis = options?.axis ?? "vertical";
  const containerElRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [state, setState] = useState<ListReorderState>(IDLE);

  const containerRef = useCallback((node: HTMLElement | null) => {
    containerElRef.current = node;
  }, []);

  /** The insertion slot (0..count) whose boundary the pointer sits nearest. */
  const slotAt = useCallback(
    (clientX: number, clientY: number): number => {
      const container = containerElRef.current;
      if (!container) {
        return 0;
      }
      const pointer = axis === "horizontal" ? clientX : clientY;
      const rows = Array.from(
        container.querySelectorAll<HTMLElement>("[data-reorder-item]")
      );
      for (let index = 0; index < rows.length; index++) {
        const rect = rows[index].getBoundingClientRect();
        const midpoint =
          axis === "horizontal"
            ? rect.left + rect.width / 2
            : rect.top + rect.height / 2;
        if (pointer < midpoint) {
          return index;
        }
      }
      return rows.length;
    },
    [axis]
  );

  const finish = useCallback(
    (commit: boolean) => {
      setState((prev) => {
        if (commit && prev.fromIndex !== null && prev.overIndex !== null) {
          const from = prev.fromIndex;
          const to = resolveReorderTarget(from, prev.overIndex);
          if (to !== from) {
            onReorder(from, to);
          }
        }
        return IDLE;
      });
      pointerIdRef.current = null;
    },
    [onReorder]
  );

  const getHandleProps = useCallback(
    (index: number): ListReorderHandleProps => ({
      onPointerDown: (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
          return;
        }
        // Own the gesture: stop the row's click and the drawer's swipe-to-close.
        event.preventDefault();
        event.stopPropagation();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capture can fail on a fast flick; the drag still tracks via moves.
        }
        pointerIdRef.current = event.pointerId;
        const row = event.currentTarget.closest<HTMLElement>(
          "[data-reorder-item]"
        );
        const rowRect = row?.getBoundingClientRect();
        setState({
          fromIndex: index,
          overIndex: index,
          preview: {
            clientX: event.clientX,
            clientY: event.clientY,
            offsetX: rowRect ? event.clientX - rowRect.left : 0,
            offsetY: rowRect ? event.clientY - rowRect.top : 0,
            width: rowRect?.width ?? 0,
          },
        });
      },
      onPointerMove: (event) => {
        if (pointerIdRef.current !== event.pointerId) {
          return;
        }
        event.preventDefault();
        const over = slotAt(event.clientX, event.clientY);
        setState((prev) => {
          if (prev.fromIndex === null) {
            return prev;
          }
          const preview = prev.preview
            ? {
                ...prev.preview,
                clientX: event.clientX,
                clientY: event.clientY,
              }
            : null;
          if (prev.overIndex === over) {
            return preview === prev.preview ? prev : { ...prev, preview };
          }
          return { ...prev, overIndex: over, preview };
        });
      },
      onPointerUp: (event) => {
        if (pointerIdRef.current !== event.pointerId) {
          return;
        }
        finish(true);
      },
      onPointerCancel: (event) => {
        if (pointerIdRef.current !== event.pointerId) {
          return;
        }
        finish(false);
      },
    }),
    [finish, slotAt]
  );

  return { containerRef, getHandleProps, state };
}
