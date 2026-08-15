"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import { writeTemplatePageId } from "@/lib/pages/template-page-cookie.ts";

interface TemplatePageContextValue {
  clearTemplatePage: () => void;
  setTemplatePageId: (id: string) => void;
  templatePageId: string | null;
}

const TemplatePageContext = createContext<TemplatePageContextValue | null>(
  null
);

interface TemplatePageProviderProps {
  children: ReactNode;
  /** SSR-known template page id (from the cookie) so SSR and hydration match. */
  initialTemplatePageId: string | null;
}

/**
 * Tracks which page acts as the template for new pages, persisted to a UI-hint
 * cookie. Kept in context so the settings panel and the sidebar (which hides the
 * template page) react to changes immediately.
 */
export function TemplatePageProvider({
  children,
  initialTemplatePageId,
}: TemplatePageProviderProps) {
  const [templatePageId, setTemplatePageIdState] = useState<string | null>(
    initialTemplatePageId
  );

  const setTemplatePageId = useCallback((id: string) => {
    setTemplatePageIdState(id);
    writeTemplatePageId(id);
  }, []);

  const clearTemplatePage = useCallback(() => {
    setTemplatePageIdState(null);
    writeTemplatePageId(null);
  }, []);

  const value = useMemo<TemplatePageContextValue>(
    () => ({ clearTemplatePage, setTemplatePageId, templatePageId }),
    [clearTemplatePage, setTemplatePageId, templatePageId]
  );

  return (
    <TemplatePageContext.Provider value={value}>
      {children}
    </TemplatePageContext.Provider>
  );
}

export function useTemplatePage(): TemplatePageContextValue {
  const context = useContext(TemplatePageContext);
  if (!context) {
    throw new Error(
      "useTemplatePage must be used within TemplatePageProvider."
    );
  }

  return context;
}
