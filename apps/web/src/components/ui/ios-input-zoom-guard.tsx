"use client";

import { useEffect } from "react";

/**
 * Stops iOS Safari's automatic page zoom when an input, textarea, or
 * contenteditable with a computed font-size under 16px receives focus — the
 * canvas blocks, formula editors, and database cells all set type below
 * that threshold by design.
 *
 * The fix is the well-established viewport trick: `maximum-scale=1` disables
 * the FOCUS auto-zoom while iOS still honors user pinch-zoom (Safari has
 * deliberately ignored the cap for user-initiated gestures since iOS 10, so
 * accessibility zoom keeps working). The cap is applied at runtime and ONLY
 * on iOS because other engines (Android Chrome) respect it literally and
 * would lose pinch-zoom entirely.
 *
 * iPadOS masquerades as macOS in the user agent, so iPad is detected by the
 * Mac platform + a real touch screen.
 */
const IOS_UA_RE = /iPhone|iPad|iPod/;

export function IosInputZoomGuard() {
  useEffect(() => {
    const isIos =
      IOS_UA_RE.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!isIos) {
      return;
    }
    const viewport = document.querySelector('meta[name="viewport"]');
    const content = viewport?.getAttribute("content");
    if (!(viewport && content) || content.includes("maximum-scale")) {
      return;
    }
    viewport.setAttribute("content", `${content}, maximum-scale=1`);
  }, []);

  return null;
}
