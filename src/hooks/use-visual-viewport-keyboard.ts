import { useEffect, useState } from "react";

/** Below this height the inset is treated as keyboard-closed (ignores small UI chrome shifts). */
const KEYBOARD_OPEN_THRESHOLD_PX = 80;

export interface VirtualKeyboardState {
  /** Height in px the on-screen keyboard overlaps the layout viewport bottom. */
  height: number;
  /** True when the on-screen keyboard is (likely) open. */
  isOpen: boolean;
}

const CLOSED: VirtualKeyboardState = { height: 0, isOpen: false };

function readKeyboardState(): VirtualKeyboardState {
  if (typeof window === "undefined" || !window.visualViewport) {
    return CLOSED;
  }

  const viewport = window.visualViewport;
  // The keyboard shrinks the visual viewport from the bottom; the gap between
  // the layout viewport bottom and the visual viewport bottom is its height.
  const height = Math.max(
    0,
    Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
  );

  return {
    height,
    isOpen: height >= KEYBOARD_OPEN_THRESHOLD_PX,
  };
}

/**
 * Tracks the on-screen (virtual) keyboard inset via the `visualViewport` API so
 * UI can be pinned just above the keyboard. Returns `{ height: 0, isOpen: false }`
 * when no keyboard is shown or the API is unavailable (e.g. SSR, desktop).
 */
export function useVisualViewportKeyboard(): VirtualKeyboardState {
  const [state, setState] = useState<VirtualKeyboardState>(CLOSED);

  useEffect(() => {
    const viewport =
      typeof window === "undefined" ? null : window.visualViewport;
    if (!viewport) {
      return;
    }

    const update = () => setState(readKeyboardState());
    update();

    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}
