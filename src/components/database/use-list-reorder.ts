import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useRef, useState } from "react";

/**
 * Pointer-driven vertical list reorder for a small, self-contained list (e.g.
 * the database Properties list) rendered inside a popover *or* a vaul drawer.
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
export interface ListReorderState {
  /** Index of the row being dragged, or null when idle. */
  fromIndex: number | null;
  /** Insertion slot under the pointer (0..count), or null when idle. */
  overIndex: number | null;
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

const IDLE: ListReorderState = { fromIndex: null, overIndex: null };

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
  onReorder: (from: number, to: number) => void
): UseListReorderResult {
  const containerElRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [state, setState] = useState<ListReorderState>(IDLE);

  const containerRef = useCallback((node: HTMLElement | null) => {
    containerElRef.current = node;
  }, []);

  /** The insertion slot (0..count) whose boundary the pointer sits nearest. */
  const slotAt = useCallback((clientY: number): number => {
    const container = containerElRef.current;
    if (!container) {
      return 0;
    }
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-reorder-item]")
    );
    for (let index = 0; index < rows.length; index++) {
      const rect = rows[index].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        return index;
      }
    }
    return rows.length;
  }, []);

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
        setState({ fromIndex: index, overIndex: index });
      },
      onPointerMove: (event) => {
        if (pointerIdRef.current !== event.pointerId) {
          return;
        }
        event.preventDefault();
        const over = slotAt(event.clientY);
        setState((prev) =>
          prev.fromIndex === null || prev.overIndex === over
            ? prev
            : { ...prev, overIndex: over }
        );
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
