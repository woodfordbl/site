import { createContext, type ReactNode, useContext, useMemo } from "react";

interface PageContentLayoutContextValue {
  /**
   * True when the content column fills the padded scroll area (full-width page
   * or mobile) instead of the centered reading column. Tables may bleed into
   * horizontal padding; top-level blocks align with the page icon (no title-text indent).
   */
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
