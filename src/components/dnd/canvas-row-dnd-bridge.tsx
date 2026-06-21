import { createContext, type ReactNode, useContext } from "react";

import {
  DndContext,
  type DndContextValue,
} from "@/components/dnd/dnd-surface.tsx";

/** Canvas row drag surface — preserved when nested table column DnD shadows `DndContext`. */
export const CanvasRowDndContext =
  createContext<DndContextValue<unknown> | null>(null);

export function useCanvasRowDndContext(): DndContextValue<unknown> | null {
  return useContext(CanvasRowDndContext);
}

/** Re-exposes the parent canvas row {@link DndContext} to descendants. */
export function CanvasRowDndBridge({ children }: { children: ReactNode }) {
  const ctx = useContext(DndContext);
  return (
    <CanvasRowDndContext.Provider value={ctx}>
      {children}
    </CanvasRowDndContext.Provider>
  );
}
