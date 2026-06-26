"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { DeviceLayoutHints } from "@/lib/device/device-layout.types.ts";
import { writeDeviceLayoutCookieToDocument } from "@/lib/device/device-layout-cookie.ts";
import {
  readDeviceLayoutFromMatchMedia,
  subscribeDeviceLayoutMatchMedia,
} from "@/lib/device/read-device-layout-media.ts";

const DeviceLayoutContext = createContext<DeviceLayoutHints | null>(null);

interface DeviceLayoutProviderProps {
  children: ReactNode;
  initialHints: DeviceLayoutHints;
}

/**
 * Seeds layout/pointer signals from SSR hints (cookie or UA), then reconciles
 * to live `matchMedia` after mount without hydration mismatch.
 */
export function DeviceLayoutProvider({
  children,
  initialHints,
}: DeviceLayoutProviderProps) {
  const [hints, setHints] = useState(initialHints);

  useEffect(() => {
    const syncFromMedia = () => {
      setHints(readDeviceLayoutFromMatchMedia());
    };

    syncFromMedia();
    return subscribeDeviceLayoutMatchMedia(syncFromMedia);
  }, []);

  const value = useMemo(() => hints, [hints]);

  return (
    <DeviceLayoutContext.Provider value={value}>
      {children}
    </DeviceLayoutContext.Provider>
  );
}

function useDeviceLayoutContext(): DeviceLayoutHints {
  const context = useContext(DeviceLayoutContext);
  if (!context) {
    throw new Error(
      "Device layout hooks must be used within DeviceLayoutProvider."
    );
  }

  return context;
}

export function useDeviceLayout(): DeviceLayoutHints {
  return useDeviceLayoutContext();
}

/** `(max-width: 767px)` — shell layout (sidebar Sheet, header slot, rail). */
export function useIsNarrowViewport(): boolean {
  return useDeviceLayoutContext().isNarrowViewport;
}

/** `(pointer: coarse)` — canvas interaction (drawer, gutter, pointer DnD). */
export function useIsCoarsePrimaryPointer(): boolean {
  return useDeviceLayoutContext().isCoarsePrimaryPointer;
}

/** Persists live `matchMedia` values for SSR on the next request. */
export function SyncDeviceLayoutCookieEffect() {
  const { isCoarsePrimaryPointer, isNarrowViewport } = useDeviceLayoutContext();

  useEffect(() => {
    writeDeviceLayoutCookieToDocument({
      isCoarsePrimaryPointer,
      isNarrowViewport,
    });
  }, [isCoarsePrimaryPointer, isNarrowViewport]);

  return null;
}
