"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

import { PageCoverDialog } from "@/components/pages/page-cover-menu.tsx";
import type { PageHeaderImage } from "@/lib/schemas/page-settings.ts";

interface PageCoverContextValue {
  headerImage: PageHeaderImage | undefined;
  /** Opens the shared cover picker dialog (header button, menu item, on-cover Change). */
  openPicker: () => void;
  setHeaderImage: (headerImage: PageHeaderImage | null) => void;
}

const PageCoverContext = createContext<PageCoverContextValue | null>(null);

/**
 * Hosts the single cover picker dialog and exposes the current cover plus an
 * `openPicker` trigger, so the page-header photo button, the ⋯ menu item, and
 * the on-cover "Change" toolbar button all drive one dialog.
 */
export function PageCoverProvider({
  children,
  headerImage,
  setHeaderImage,
}: {
  children: ReactNode;
  headerImage: PageHeaderImage | undefined;
  setHeaderImage: (headerImage: PageHeaderImage | null) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const value = useMemo<PageCoverContextValue>(
    () => ({
      headerImage,
      setHeaderImage,
      openPicker: () => setPickerOpen(true),
    }),
    [headerImage, setHeaderImage]
  );

  return (
    <PageCoverContext.Provider value={value}>
      {children}
      <PageCoverDialog
        headerImage={headerImage}
        onChange={setHeaderImage}
        onOpenChange={setPickerOpen}
        open={pickerOpen}
      />
    </PageCoverContext.Provider>
  );
}

/** Cover controls for descendants of {@link PageCoverProvider}; null outside it. */
export function usePageCover(): PageCoverContextValue | null {
  return useContext(PageCoverContext);
}
