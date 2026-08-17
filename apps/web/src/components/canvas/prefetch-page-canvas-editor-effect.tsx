"use client";

import { useEffect } from "react";

import { scheduleIdleCallback } from "@/lib/dom/schedule-idle-callback.ts";

/**
 * Idle-prefetch the canvas editor chunk so editing is ready quickly. Content
 * paints from the main bundle (server/local read-only views) regardless, so
 * this never blocks first paint.
 */
export function PrefetchPageCanvasEditorEffect() {
  useEffect(
    () =>
      scheduleIdleCallback(() => {
        import("./page-canvas-editor.tsx").catch(() => {
          /* client-only editor bundle */
        });
      }),
    []
  );

  return null;
}
