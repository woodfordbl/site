import { createContext, type ReactNode, useContext, useMemo } from "react";

import { useLocalPagesSnapshot } from "@/hooks/use-local-pages.ts";
import type { PageFormulaSource } from "@/lib/formula/page-scope.ts";

/**
 * The page that inline formula tokens evaluate `thisPage` against.
 *
 * A context rather than a prop: a token can sit in any rich-text field at any
 * depth of the block tree, and threading the page through every block type
 * would put a page-shaped parameter on components that have no other reason to
 * know about pages.
 *
 * Null outside a page (a database cell, a standalone field). Tokens there stay
 * pending rather than resolving against the wrong page — which is only ever a
 * theoretical state today, since a token can be inserted only into page prose.
 */
const InlineFormulaPageContext = createContext<PageFormulaSource | null>(null);

export function useInlineFormulaPage(): PageFormulaSource | null {
  return useContext(InlineFormulaPageContext);
}

interface InlineFormulaPageProviderProps {
  children: ReactNode;
  pageId: string;
  /** Shipped title, used until the page has a local row. */
  title: string;
}

export function InlineFormulaPageProvider({
  children,
  pageId,
  title,
}: InlineFormulaPageProviderProps) {
  // The collection snapshot, not `useLocalPages`: this provider wraps the whole
  // canvas, including surfaces that render without a route context.
  const pages = useLocalPagesSnapshot();
  const page = pages.find((entry) => entry.id === pageId);
  const createdAt = page?.createdAt;
  const updatedAt = page?.updatedAt;
  const localTitle = page?.title;

  const value = useMemo<PageFormulaSource>(
    () => ({
      title: localTitle ?? title,
      // A shipped page with no local row yet has no timestamps of its own;
      // blank parses to an empty date rather than a wrong one.
      createdAt: createdAt ?? "",
      updatedAt: updatedAt ?? "",
    }),
    [createdAt, localTitle, title, updatedAt]
  );

  return (
    <InlineFormulaPageContext.Provider value={value}>
      {children}
    </InlineFormulaPageContext.Provider>
  );
}
