"use client";

import { useEffect } from "react";

const SCROLL_END_MS = 150;

function isNativeScrollbarTarget(element: Element): boolean {
  return !(
    element.classList.contains("no-scrollbar") ||
    element.classList.contains("base-ui-disable-scrollbar") ||
    element.matches("[data-slot='scroll-area-viewport']")
  );
}

/** Tracks scroll on native overflow containers so global scrollbar CSS can auto-show. */
export function NativeScrollbarEffect() {
  useEffect(() => {
    const timeouts = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>();

    function handleScroll(event: Event) {
      const target = event.target;
      if (!(target instanceof Element && isNativeScrollbarTarget(target))) {
        return;
      }

      target.setAttribute("data-scrolling", "");

      const existingTimeout = timeouts.get(target);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        target.removeAttribute("data-scrolling");
        timeouts.delete(target);
      }, SCROLL_END_MS);

      timeouts.set(target, timeout);
    }

    document.addEventListener("scroll", handleScroll, {
      capture: true,
      passive: true,
    });

    return () => {
      document.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, []);

  return null;
}
