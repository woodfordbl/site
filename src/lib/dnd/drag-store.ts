export interface DragPointer {
  x: number;
  y: number;
}

/** Transient drag state for one surface, read via `useSyncExternalStore`. */
export interface DragState<TDropTarget> {
  draggingId: string | null;
  dropTarget: TDropTarget | null;
  pointer: DragPointer | null;
}

export interface DragStore<TDropTarget> {
  endDrag(): void;
  getSnapshot(): DragState<TDropTarget>;
  setDropTarget(target: TDropTarget | null): void;
  setPointer(pointer: DragPointer): void;
  startDrag(id: string, pointer: DragPointer): void;
  subscribe(listener: () => void): () => void;
}

const IDLE_STATE: DragState<unknown> = {
  draggingId: null,
  pointer: null,
  dropTarget: null,
};

/**
 * Tiny external store holding one surface's transient drag state. Snapshots are
 * replaced immutably so selector hooks can bail out when their slice is
 * unchanged, keeping per-`dragover` re-renders scoped to the affected row.
 */
export function createDragStore<TDropTarget>(): DragStore<TDropTarget> {
  let state = IDLE_STATE as DragState<TDropTarget>;
  const listeners = new Set<() => void>();

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const set = (next: DragState<TDropTarget>) => {
    state = next;
    emit();
  };

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startDrag(id, pointer) {
      set({ draggingId: id, pointer, dropTarget: null });
    },
    setPointer(pointer) {
      if (state.draggingId == null) {
        return;
      }
      set({ ...state, pointer });
    },
    setDropTarget(target) {
      if (state.dropTarget === target) {
        return;
      }
      set({ ...state, dropTarget: target });
    },
    endDrag() {
      if (
        state.draggingId == null &&
        state.pointer == null &&
        state.dropTarget == null
      ) {
        return;
      }
      set(IDLE_STATE as DragState<TDropTarget>);
    },
  };
}
