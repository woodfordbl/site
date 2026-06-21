"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect } from "react";

import {
  prefetchPageIconCatalogs,
  warmPageIconPicker,
} from "@/lib/pages/preload-page-icon-picker.ts";

/** Prefetch Tabler catalog before paint; idle-warm picker chunks after. */
export function WarmPageIconPickerCacheEffect() {
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    prefetchPageIconCatalogs(queryClient);
  }, [queryClient]);

  useEffect(() => {
    const idleId = requestIdleCallback(() => {
      warmPageIconPicker(queryClient);
    });
    return () => {
      cancelIdleCallback(idleId);
    };
  }, [queryClient]);

  return null;
}
