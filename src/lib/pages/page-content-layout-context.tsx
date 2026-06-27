import { createContext, type ReactNode, useContext, useMemo } from "react";

interface PageContentLayoutContextValue {
  /** True when canvas content may bleed to panel edges (full-width page or mobile). */
  useFullPanelWidth: boolean;
}

const PageContentLayoutContext =
  createContext<PageContentLayoutContextValue | null>(null);

/** Supplies layout width context to canvas blocks (e.g. table panel bleed). */
export function PageContentLayoutProvider({
  children,
  useFullPanelWidth,
}: {
  children: ReactNode;
  useFullPanelWidth: boolean;
}) {
  const value = useMemo(() => ({ useFullPanelWidth }), [useFullPanelWidth]);

  return (
    <PageContentLayoutContext.Provider value={value}>
      {children}
    </PageContentLayoutContext.Provider>
  );
}

/** Whether block types (e.g. tables) may bleed into canvas horizontal padding. */
export function usePageContentLayout(): PageContentLayoutContextValue {
  const context = useContext(PageContentLayoutContext);
  if (!context) {
    return { useFullPanelWidth: true };
  }
  return context;
}
