"use client";

import { createContext, useContext } from "react";

import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";

interface VersionPreviewValue {
  /** Replace the page with a read-only render of this checkpoint. */
  enterPreview: (descriptor: PageSnapshotDescriptor) => void;
}

const VersionPreviewContext = createContext<VersionPreviewValue | null>(null);

export const VersionPreviewProvider = VersionPreviewContext.Provider;

/** Available inside `PageWorkspace`; null elsewhere (the picker no-ops then). */
export function useVersionPreview(): VersionPreviewValue | null {
  return useContext(VersionPreviewContext);
}
