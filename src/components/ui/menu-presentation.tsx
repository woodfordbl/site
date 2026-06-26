"use client";

import { IconCheck, IconChevronLeft } from "@tabler/icons-react";
import {
  cloneElement,
  createContext,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { useHaptics } from "@/hooks/haptics.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Shared engine that lets the dropdown/context-menu and popover primitives swap
 * their anchored popover presentation for a bottom drawer on touch devices,
 * while keeping the same compound component API at every call site.
 *
 * The drawer-mode building blocks (rows, section labels, separators, the
 * push/pop "screen" used for submenus) are generalized from the bespoke
 * mobile block-actions drawer so they live in one place.
 */

type MenuPresentation = "popover" | "drawer";

/** Resolves which presentation a menu/popover should use right now. */
export function useResolvedMenuPresentation(): MenuPresentation {
  return useIsCoarsePrimaryPointer() ? "drawer" : "popover";
}

// --- Root open-state context (read by triggers + content) -------------------

interface MenuRootValue {
  open: boolean;
  presentation: MenuPresentation;
  setOpen: (open: boolean) => void;
}

const MenuRootContext = createContext<MenuRootValue | null>(null);

export function MenuRootProvider({
  children,
  ...value
}: MenuRootValue & { children: ReactNode }) {
  return (
    <MenuRootContext.Provider value={value}>
      {children}
    </MenuRootContext.Provider>
  );
}

export function useMenuRoot(): MenuRootValue | null {
  return useContext(MenuRootContext);
}

/**
 * Lifts open state for a menu/popover rendered in drawer mode so the trigger
 * and content share a single source of truth (mirrors the controlled or
 * uncontrolled state the caller passed to the Base UI root).
 */
export function MenuDrawerRoot({
  children,
  defaultOpen,
  onOpenChange,
  open: openProp,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  const isControlled = openProp !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(
    defaultOpen ?? false
  );
  const open = isControlled ? Boolean(openProp) : uncontrolledOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  return (
    <MenuRootProvider open={open} presentation="drawer" setOpen={setOpen}>
      {children}
    </MenuRootProvider>
  );
}

/** Base UI exposes className as `string | (state) => string`; drawer mode wants a string. */
export function asClassName(className: unknown): string | undefined {
  return typeof className === "string" ? className : undefined;
}

const WIDTH_CLASS_PATTERN = /^(?:w|min-w|max-w)-/;
const WHITESPACE_PATTERN = /\s+/;

/** Drops width utilities so popover/menu content fills the full-width drawer. */
export function withoutWidthClasses(className?: string): string | undefined {
  if (!className) {
    return;
  }
  return className
    .split(WHITESPACE_PATTERN)
    .filter((token) => !WIDTH_CLASS_PATTERN.test(token))
    .join(" ");
}

/**
 * Drawer rendering of a menu/popover trigger. Clones the caller's `render`
 * element (e.g. a Button or Link) and wires its click to open the drawer,
 * dropping popover-only props that don't apply to a drawer.
 */
export function DrawerMenuTrigger({
  children,
  className,
  onClick,
  render,
}: {
  children?: ReactNode;
  className?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  render?: ReactElement;
}) {
  const root = useMenuRoot();

  if (render && isValidElement(render)) {
    const renderProps = render.props as {
      className?: string;
      onClick?: (event: MouseEvent<HTMLElement>) => void;
    };
    const handleRenderClick = (event: MouseEvent<HTMLElement>) => {
      // Preserve the render element's own click behavior (e.g. a drag handle's
      // preventDefault) before opening the drawer.
      renderProps.onClick?.(event);
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      root?.setOpen(true);
    };
    const element = render as ReactElement<Record<string, unknown>>;
    const nextProps = {
      className: cn(renderProps.className, className),
      onClick: handleRenderClick,
    };
    return children == null
      ? cloneElement(element, nextProps)
      : cloneElement(element, nextProps, children);
  }

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    root?.setOpen(true);
  };

  return (
    <button className={className} onClick={handleClick} type="button">
      {children}
    </button>
  );
}

// --- Item presentation context (read by item-level components) --------------

interface MenuPresentationValue {
  /** Portal target for submenu screens (the relative drawer body). */
  bodyEl: HTMLDivElement | null;
  /** Closes the whole drawer. */
  close: () => void;
  presentation: MenuPresentation;
}

const MenuPresentationContext = createContext<MenuPresentationValue>({
  bodyEl: null,
  close: () => {
    /* no-op in popover mode */
  },
  presentation: "popover",
});

export function useMenuPresentation(): MenuPresentationValue {
  return useContext(MenuPresentationContext);
}

/**
 * Wraps drawer-mode menu/popover content. Provides the scrollable body and the
 * portal target that submenu screens slide in over.
 */
export function MenuPresentationProvider({
  children,
  close,
  className,
}: {
  children: ReactNode;
  className?: string;
  close: () => void;
}) {
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);

  return (
    <MenuPresentationContext.Provider
      value={{ bodyEl, close, presentation: "drawer" }}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
        ref={setBodyEl}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-3",
            className
          )}
        >
          {children}
        </div>
      </div>
    </MenuPresentationContext.Provider>
  );
}

/**
 * A submenu rendered as a screen that slides in over the drawer body, with a
 * back button. Mounts via portal into the drawer body so it covers the full
 * surface regardless of scroll position.
 */
export function MenuDrawerScreen({
  children,
  onBack,
  open,
  title,
}: {
  children: ReactNode;
  onBack: () => void;
  open: boolean;
  title?: ReactNode;
}) {
  const { bodyEl } = useMenuPresentation();

  if (!bodyEl) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden={open ? undefined : true}
      className={cn(
        "absolute inset-0 z-10 flex flex-col bg-popover transition-transform duration-200",
        "motion-reduce:transition-none",
        open ? "translate-x-0" : "pointer-events-none translate-x-full"
      )}
      data-slot="menu-drawer-screen"
    >
      <div className="flex items-center gap-1 px-1 py-2">
        <button
          aria-label="Back"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground active:bg-accent"
          onClick={onBack}
          type="button"
        >
          <IconChevronLeft className="size-5" />
        </button>
        {title ? (
          <span className="cn-font-heading font-medium text-base text-foreground">
            {title}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-3">
        {children}
      </div>
    </div>,
    bodyEl
  );
}

// --- Drawer-mode primitives -------------------------------------------------

const rowClassName = (destructive?: boolean) =>
  cn(
    "group/drawer-row flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px] no-underline outline-none transition-colors active:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
    destructive
      ? "text-destructive [&_svg]:text-destructive"
      : "text-foreground [&_svg]:text-muted-foreground"
  );

interface DrawerMenuRowProps {
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Render the row as this element (e.g. a router Link) instead of a button. */
  render?: ReactElement;
  trailing?: ReactNode;
}

/**
 * The drawer rendering of a menu item. Renders a tall touch-friendly row and
 * fires a selection haptic. When `render` is supplied (e.g. a Link), the row is
 * cloned onto that element so navigation behavior is preserved.
 */
export function DrawerMenuRow({
  children,
  destructive,
  disabled,
  onClick,
  render,
  trailing,
}: DrawerMenuRowProps) {
  const haptic = useHaptics();

  const body = (
    <>
      <span className="flex min-w-0 flex-1 items-center gap-3">{children}</span>
      {trailing}
    </>
  );

  if (render && isValidElement(render)) {
    const renderProps = render.props as {
      className?: string;
      onClick?: (event: MouseEvent<HTMLElement>) => void;
    };
    const handleRenderClick = (event: MouseEvent<HTMLElement>) => {
      if (disabled) {
        event.preventDefault();
        return;
      }
      renderProps.onClick?.(event);
      haptic("selection");
      onClick?.(event);
    };
    return cloneElement(
      render as ReactElement<Record<string, unknown>>,
      {
        className: cn(rowClassName(destructive), renderProps.className),
        "data-disabled": disabled ? "" : undefined,
        onClick: handleRenderClick,
      },
      body
    );
  }

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    haptic("selection");
    onClick?.(event);
  };

  return (
    <button
      className={rowClassName(destructive)}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      {body}
    </button>
  );
}

export function DrawerMenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
      {children}
    </div>
  );
}

export function DrawerMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

export function DrawerCheckTrailing({ checked }: { checked: boolean }) {
  if (!checked) {
    return null;
  }
  return <IconCheck className="size-5 shrink-0 text-muted-foreground" />;
}

// --- Submenu coordination (drawer mode) -------------------------------------

interface MenuDrawerSubValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The trigger's label, surfaced as the pushed screen's title. */
  titleRef: RefObject<ReactNode>;
}

const MenuDrawerSubContext = createContext<MenuDrawerSubValue | null>(null);

/** Owns one submenu's open state so its trigger can push the content screen. */
export function MenuDrawerSubProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const titleRef = useRef<ReactNode>(null);

  return (
    <MenuDrawerSubContext.Provider value={{ open, setOpen, titleRef }}>
      {children}
    </MenuDrawerSubContext.Provider>
  );
}

export function useMenuDrawerSub(): MenuDrawerSubValue | null {
  return useContext(MenuDrawerSubContext);
}

// --- Radio group coordination (drawer mode) ---------------------------------

interface MenuRadioGroupValue {
  setValue: (value: string) => void;
  value?: string;
}

const MenuRadioGroupContext = createContext<MenuRadioGroupValue | null>(null);

export function MenuRadioGroupProvider({
  children,
  setValue,
  value,
}: MenuRadioGroupValue & { children: ReactNode }) {
  return (
    <MenuRadioGroupContext.Provider value={{ setValue, value }}>
      {children}
    </MenuRadioGroupContext.Provider>
  );
}

export function useMenuRadioGroup(): MenuRadioGroupValue | null {
  return useContext(MenuRadioGroupContext);
}
