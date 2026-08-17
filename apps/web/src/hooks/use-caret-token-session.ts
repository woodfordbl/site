/**
 * Shared open/close/sync lifecycle for caret-anchored `@` / `$` popovers.
 * Callers supply `readContext` (usually {@link readCaretTokenContext} bound to
 * a trigger). Escape / click-away / blur leave the typed trigger as plain text.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { isRichTextField } from "@/lib/editor/caret-navigation.ts";
import {
  type CaretTokenContext,
  readCaretAnchorRect,
} from "@/lib/editor/caret-token-trigger.ts";

export interface CaretTokenSession {
  anchorRect: DOMRect | null;
  close: () => void;
  context: CaretTokenContext | null;
  /** Freeze the current context (stop re-reading on input) — used by `$`. */
  freeze: () => void;
  frozen: boolean;
  sync: () => void;
}

export function useCaretTokenSession(
  readContext: () => CaretTokenContext | null,
  options?: {
    /**
     * Selector for elements that keep the session open on mousedown/focus
     * (the popover root). Defaults to `[data-caret-token-popover]`.
     */
    popoverSelector?: string;
  }
): CaretTokenSession {
  const popoverSelector =
    options?.popoverSelector ?? "[data-caret-token-popover]";
  const [context, setContext] = useState<CaretTokenContext | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [frozen, setFrozen] = useState(false);
  const frozenRef = useRef(false);
  // Set when a session closes with its trigger run still in the text, so the
  // next keystroke does not reopen what the user just dismissed.
  const suppressedRef = useRef(false);

  const close = useCallback(() => {
    // Closing while the run is still typed (Escape, click-away) is the user
    // rejecting THIS run: the trigger char goes back to being ordinary text and
    // must stay that way while they keep typing — `$5` is a price, not a
    // formula. Closing with the run already gone (a confirmed insert) leaves
    // suppression off. `sync` lifts it once the run ends.
    suppressedRef.current = readContext() !== null;
    frozenRef.current = false;
    setFrozen(false);
    setContext(null);
    setAnchorRect(null);
  }, [readContext]);

  const freeze = useCallback(() => {
    frozenRef.current = true;
    setFrozen(true);
  }, []);

  const sync = useCallback(() => {
    if (frozenRef.current) {
      return;
    }
    const next = readContext();
    if (suppressedRef.current) {
      // Still inside the dismissed run — keep quiet. Once the run ends (the
      // trigger deleted, whitespace typed, caret moved away) a fresh trigger
      // is allowed to open again.
      if (next !== null) {
        return;
      }
      suppressedRef.current = false;
    }
    setContext(next);
    setAnchorRect(next ? readCaretAnchorRect() : null);
  }, [readContext]);

  useEffect(() => {
    const handleInput = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && isRichTextField(target)) {
        sync();
      }
    };
    document.addEventListener("input", handleInput, true);
    return () => document.removeEventListener("input", handleInput, true);
  }, [sync]);

  useEffect(() => {
    if (!context) {
      return;
    }
    const handleSelectionChange = () => {
      if (frozenRef.current) {
        return;
      }
      if (!readContext()) {
        close();
      }
    };
    const handleScroll = () => {
      if (!frozenRef.current) {
        close();
      }
    };
    const handleFocusOut = () => {
      // Frozen sessions (formula panel) steal focus into the popover; ignore
      // transient focusout while that handoff completes. Click-away still
      // closes via mousedown.
      if (frozenRef.current) {
        return;
      }
      window.setTimeout(() => {
        if (frozenRef.current) {
          return;
        }
        const active = document.activeElement;
        if (
          active &&
          (isRichTextField(active) || active.closest(popoverSelector))
        ) {
          return;
        }
        close();
      }, 0);
    };
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(popoverSelector)) {
        return;
      }
      close();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    window.addEventListener("scroll", handleScroll, true);
    document.addEventListener("focusout", handleFocusOut, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      window.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [context, close, popoverSelector, readContext]);

  return { anchorRect, close, context, freeze, frozen, sync };
}
