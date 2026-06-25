"use client";

import { useEffect } from "react";

import { scheduleIdleCallback } from "@/lib/dom/schedule-idle-callback.ts";
import { warmPageIconPickerChunks } from "@/lib/pages/preload-page-icon-picker.ts";

/** Idle-warm picker panel chunks once per session; catalogs load on picker intent only. */
export function WarmPageIconPickerCacheEffect() {
  useEffect(() => scheduleIdleCallback(() => warmPageIconPickerChunks()), []);

  return null;
}
