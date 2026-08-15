"use client";

import { type RefObject, useEffect } from "react";

/**
 * Hover tracking for links inside a contenteditable field, by delegation.
 *
 * Delegated rather than per-anchor because the field owns its DOM: it rebuilds
 * every child on each keystroke, so React never holds the anchors and cannot
 * attach handlers to them. Listening on the field root also keeps the caret
 * and selection untouched, which per-anchor React nodes would not.
 *
 * Two callers share this (external URL previews and page-link previews), so
 * the guards below — which are easy to get subtly wrong — live in one place.
 */

function resolveHoveredAnchor(
  target: EventTarget | null,
  root: HTMLElement
): HTMLAnchorElement | null {
  if (!(target instanceof Element && root.contains(target))) {
    return null;
  }
  const anchor = target.closest("a[href], a[data-href]");
  if (!(anchor instanceof HTMLAnchorElement && root.contains(anchor))) {
    return null;
  }
  return anchor;
}

export interface DelegatedLinkHoverOptions {
  enabled: boolean;
  fieldRef: RefObject<HTMLElement | null>;
  /** Pointer entered an owned anchor. */
  onEnter: (anchor: HTMLAnchorElement) => void;
  /** Pointer left an owned anchor. */
  onLeave: () => void;
  /** Pointer pressed anywhere in the field — the reader is editing, not reading. */
  onPointerDown: () => void;
  /** Which anchors this listener owns; the rest belong to another preview. */
  owns: (anchor: HTMLAnchorElement) => boolean;
}

export function useDelegatedLinkHover({
  enabled,
  fieldRef,
  onEnter,
  onLeave,
  onPointerDown,
  owns,
}: DelegatedLinkHoverOptions): void {
  useEffect(() => {
    const root = fieldRef.current;
    if (!(root && enabled)) {
      return;
    }

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const next = resolveHoveredAnchor(event.target, root);
      if (!(next && owns(next))) {
        return;
      }
      // Moving between an anchor's own children is not a new hover.
      const related = event.relatedTarget;
      if (related instanceof Node && next.contains(related)) {
        return;
      }
      // Mid drag-select the reader is selecting text, not aiming at the link.
      const selection = root.ownerDocument.getSelection();
      if (
        selection &&
        !selection.isCollapsed &&
        root.contains(selection.anchorNode)
      ) {
        return;
      }
      onEnter(next);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      const leaving = resolveHoveredAnchor(event.target, root);
      if (!(leaving && owns(leaving))) {
        return;
      }
      const related = event.relatedTarget;
      if (related instanceof Node && leaving.contains(related)) {
        return;
      }
      onLeave();
    };

    root.addEventListener("pointerover", handlePointerOver);
    root.addEventListener("pointerout", handlePointerOut);
    root.addEventListener("pointerdown", onPointerDown);
    return () => {
      root.removeEventListener("pointerover", handlePointerOver);
      root.removeEventListener("pointerout", handlePointerOut);
      root.removeEventListener("pointerdown", onPointerDown);
    };
  }, [enabled, fieldRef, onEnter, onLeave, onPointerDown, owns]);
}
