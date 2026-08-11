import { createContext, type ReactNode, useContext, useMemo } from "react";

import type { TopLevelBlockAlign } from "@/lib/canvas/top-level-row-align.ts";

interface PageContentLayoutContextValue {
  /**
   * Left-edge anchor for top-level rows — the title text column on ordinary
   * pages, the content column edge on row pages whose properties band sits
   * above the blocks. @see TopLevelBlockAlign
   */
  topLevelBlockAlign: TopLevelBlockAlign;
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
  topLevelBlockAlign = "title-text",
  useFullPanelWidth,
}: {
  children: ReactNode;
  topLevelBlockAlign?: TopLevelBlockAlign;
  useFullPanelWidth: boolean;
}) {
  const value = useMemo(
    () => ({ topLevelBlockAlign, useFullPanelWidth }),
    [topLevelBlockAlign, useFullPanelWidth]
  );

  return (
    <PageContentLayoutContext.Provider value={value}>
      {children}
    </PageContentLayoutContext.Provider>
  );
}

/**
 * Canvas content layout: whether block types (e.g. tables) may bleed into
 * horizontal padding, and where top-level rows anchor their left edge.
 */
export function usePageContentLayout(): PageContentLayoutContextValue {
  const context = useContext(PageContentLayoutContext);
  if (!context) {
    return { topLevelBlockAlign: "title-text", useFullPanelWidth: true };
  }
  return context;
}
