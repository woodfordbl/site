"use client";

import type * as React from "react";
import { useCallback, useRef } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "@/lib/utils.ts";

type DrawerVariant = "auto" | "menu";

/**
 * When a nested drawer opens, vaul scales the parent drawer back
 * (`transform: scale(...)`) but leaves it undimmed — so the receding drawer
 * stays fully lit behind the one pulling up. These drive a black scrim over it
 * that tracks that scale: clear at rest, darkening linearly to
 * `NESTED_BACKDROP_MAX_DIM` at vaul's fully-nested scale. It's the same black as
 * the drawer overlay (`bg-black/20`, `DrawerOverlay`), so the receding drawer
 * dims into the exact color the incoming overlay uses rather than a
 * washed-out `brightness()` tint of its own colors. The values mirror vaul's own
 * displacement and transition so the dim and the scale move as one.
 */
const NESTED_BACKDROP_MAX_DIM = 0.2;
/** Mirrors vaul's internal `NESTED_DISPLACEMENT` (px a parent is pushed back). */
const VAUL_NESTED_DISPLACEMENT = 16;
/** Mirrors vaul's `TRANSITIONS` (0.5s + its ease), for the scrim's opacity. */
const VAUL_NESTED_TRANSITION = "opacity 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
const DRAWER_SCALE_PATTERN = /scale\(([\d.]+)\)/;

/**
 * vaul refuses to drag while `window.getSelection()` has highlighted text, and
 * Chrome reflects a text field's internal selection there. Drawers that
 * autofocus-and-select an input (e.g. rename fields) are therefore born
 * undraggable. A mouse press collapses such a selection natively, but a touch
 * press does not — so mirror that here: when a touch press starts outside the
 * selection's own field, collapse it so the drag can begin. A press on the
 * field itself is left alone (the user may be adjusting their selection).
 */
function collapseForeignFieldSelection(
  event: React.PointerEvent<HTMLDivElement>
): void {
  if (event.pointerType === "mouse") {
    return;
  }
  const active = document.activeElement;
  if (
    !(
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
    ) ||
    (event.target instanceof Node && active.contains(event.target))
  ) {
    return;
  }
  try {
    if (
      active.selectionStart !== null &&
      active.selectionStart !== active.selectionEnd
    ) {
      const end = active.selectionEnd ?? active.value.length;
      active.setSelectionRange(end, end);
    }
  } catch {
    // Some input types (e.g. number) don't support selection APIs.
  }
}

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

/**
 * A drawer nested inside another drawer. vaul scales the parent drawer back and
 * stacks this one on top (parent stays mounted, dimmed behind). Used by menu
 * submenus so each level opens as its own drawer rather than a slide-over
 * screen.
 */
function DrawerNestedRoot({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.NestedRoot>) {
  return <DrawerPrimitive.NestedRoot data-slot="drawer-nested" {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      className={cn(
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/20 data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      )}
      data-slot="drawer-overlay"
      {...props}
    />
  );
}

/**
 * vaul drags via pointer events, but when a touch lands on a natively
 * scrollable element the browser latches a scroll gesture and fires
 * `pointercancel` — even when the scroller is already at the top and a
 * downward pan cannot scroll anything. That made drawers with overflowing
 * lists (plain `overflow-y-auto` or the Base UI ScrollArea viewport)
 * impossible to swipe away from the body. vaul only counteracts this on
 * iOS + `modal`; this guard covers every drawer: prevent the native scroll
 * from starting for a downward touch move whose nearest scroller inside the
 * drawer is at `scrollTop` 0, so the pointer stream survives and vaul's own
 * drag logic takes over. Scrolled lists keep native scrolling (no dismissal
 * mid-list), and `data-vaul-no-drag` regions are left untouched.
 */
/**
 * Whether a downward pan from `target` would natively scroll a scroller
 * between it and `boundary` — i.e. some scroll container is not at its top,
 * so the browser (not vaul) should own the gesture.
 */
function hasScrollableAboveTop(target: EventTarget | null, boundary: Element) {
  let element = target instanceof Element ? target : null;
  while (element && element !== boundary) {
    if (element.scrollHeight > element.clientHeight) {
      const { overflowY } = getComputedStyle(element);
      if (overflowY === "auto" || overflowY === "scroll") {
        // At the top the native scroll is a no-op — vaul should drag instead.
        return element.scrollTop > 0;
      }
    }
    element = element.parentElement;
  }
  return false;
}

function useDrawerBoundaryTouchGuard(): (node: HTMLDivElement | null) => void {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) {
      return;
    }

    let lastY = 0;
    const onTouchStart = (event: TouchEvent) => {
      lastY = event.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.touches.length > 1) {
        return;
      }
      const movingDown = touch.clientY > lastY;
      lastY = touch.clientY;
      if (!(movingDown && event.cancelable)) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest("[data-vaul-no-drag]") ||
        hasScrollableAboveTop(event.target, node)
      ) {
        return;
      }
      event.preventDefault();
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    cleanupRef.current = () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
    };
  }, []);
}

/**
 * Darkens a drawer proportionally to the scale vaul applies while a nested
 * drawer is stacked on top of it, by driving the opacity of a black scrim (the
 * `data-slot="drawer-dim"` child) over it — so the background drawer recedes
 * into the same black the incoming overlay uses: clear at rest, easing to
 * `NESTED_BACKDROP_MAX_DIM` at the fully-nested scale. vaul mutates the content
 * element's inline `transform` for every phase — the eased rise on open, the
 * finger-proportional drag while the nested drawer is swiped away, and the
 * settle on release — so mirroring its live scale onto the scrim tracks all of
 * them with no extra state. A top-level drawer with no nested child never gets a
 * `scale()` (its own drag is a pure translate), so its scrim stays clear.
 *
 * The scrim lives on a separate child, so writing its opacity never feeds back
 * into the observer watching the content's own `style`.
 */
function useNestedBackdropFade(): (node: HTMLDivElement | null) => void {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((node: HTMLDivElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!node) {
      return;
    }
    const scrim = node.querySelector<HTMLElement>(
      ':scope > [data-slot="drawer-dim"]'
    );
    if (!scrim) {
      return;
    }

    const sync = () => {
      const scaleMatch = DRAWER_SCALE_PATTERN.exec(node.style.transform);
      const scale = scaleMatch ? Number.parseFloat(scaleMatch[1]) : 1;
      // vaul's fully-nested scale is `(innerWidth - 16) / innerWidth`, i.e. a
      // scale delta of `16 / innerWidth`. Normalize the live delta onto 0..1 so
      // the dim finishes exactly at the final (fully-nested) scale.
      const maxDelta = VAUL_NESTED_DISPLACEMENT / (window.innerWidth || 1);
      const progress = Math.min(Math.max((1 - scale) / maxDelta, 0), 1);
      const dim = progress * NESTED_BACKDROP_MAX_DIM;
      // While vaul animates the scale (open / close / release) it sets a
      // `transform` transition; give the scrim the matching curve so they move
      // together. While the nested drawer is dragged vaul sets `none`, and the
      // dim should likewise track the finger 1:1.
      scrim.style.transition =
        node.style.transition === "none" ? "none" : VAUL_NESTED_TRANSITION;
      scrim.style.opacity = dim < 0.001 ? "" : dim.toFixed(3);
    };

    const observer = new MutationObserver(sync);
    observer.observe(node, { attributeFilter: ["style"] });
    sync();

    cleanupRef.current = () => {
      observer.disconnect();
      scrim.style.opacity = "";
    };
  }, []);
}

function DrawerContent({
  className,
  children,
  showHandle = true,
  variant = "auto",
  hasTitle = true,
  ref,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  showHandle?: boolean;
  /**
   * "auto" hugs its content (default, current behavior). "menu" makes the
   * drawer take up most of the screen — used by menus/popovers adapted to
   * touch so action lists and pickers get a tall, scrollable surface.
   */
  variant?: DrawerVariant;
  /**
   * When false, render a visually hidden `DrawerTitle` so vaul's accessibility
   * requirement is satisfied for drawers whose content has no explicit title.
   */
  hasTitle?: boolean;
}) {
  const boundaryGuardRef = useDrawerBoundaryTouchGuard();
  const backdropFadeRef = useNestedBackdropFade();

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        className={cn(
          "group/drawer-content fixed z-50 flex flex-col bg-popover bg-clip-padding text-popover-foreground",
          "inset-x-0 bottom-0 rounded-t-2xl border-t",
          variant === "menu"
            ? "mt-12 h-[88svh] max-h-[88svh]"
            : "mt-24 h-auto max-h-[85svh]",
          "pb-[env(safe-area-inset-bottom)]",
          className
        )}
        data-slot="drawer-content"
        data-variant={variant}
        ref={(node: HTMLDivElement | null) => {
          boundaryGuardRef(node);
          backdropFadeRef(node);
          if (typeof ref === "function") {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        {...props}
        onPointerDownCapture={(event) => {
          props.onPointerDownCapture?.(event);
          collapseForeignFieldSelection(event);
        }}
      >
        {hasTitle ? null : <DrawerTitle className="sr-only">Menu</DrawerTitle>}
        {showHandle ? (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
        ) : null}
        {children}
        {/* Black scrim, driven by useNestedBackdropFade: darkens this drawer
            (in the overlay's own color) as a nested drawer stacks over it. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-t-2xl bg-black opacity-0"
          data-slot="drawer-dim"
        />
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 p-4 text-center md:text-left",
        className
      )}
      data-slot="drawer-header"
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      data-slot="drawer-footer"
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn(
        "cn-font-heading font-medium text-base text-foreground",
        className
      )}
      data-slot="drawer-title"
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="drawer-description"
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerNestedRoot,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
