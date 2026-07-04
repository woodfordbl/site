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
import { DrawerContent, DrawerNestedRoot } from "@/components/ui/drawer.tsx";
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
      // preventDefault) before opening the drawer. If the render element itself
      // suppresses the click, don't open.
      renderProps.onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }
      // The trigger's own onClick may preventDefault/stopPropagation purely to
      // stop the surrounding row from navigating (mirrors popover mode, where
      // Base UI opens regardless). Run it, then open the drawer anyway.
      onClick?.(event);
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
    // The trigger's onClick may preventDefault/stopPropagation to stop the
    // surrounding row from navigating; open the drawer regardless (parity with
    // popover mode).
    onClick?.(event);
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
  /** Closes the whole menu stack (every nested drawer back to the root). */
  close: () => void;
  presentation: MenuPresentation;
}

const MenuPresentationContext = createContext<MenuPresentationValue>({
  close: () => {
    /* no-op in popover mode */
  },
  presentation: "popover",
});

export function useMenuPresentation(): MenuPresentationValue {
  return useContext(MenuPresentationContext);
}

/**
 * Static role tag a menu/popover part carries so the grouped drawer body can
 * split a flat child list into cards: `"break"` on separators (ends a card) and
 * `"label"` on section labels (ends a card and renders standalone above the
 * next one). Read structurally off the element's component identity, so no
 * circular import back to dropdown/context menus is needed.
 */
export type MenuDrawerRole = "break" | "label";

/** React's Fragment element type, matched without importing `Fragment`. */
const REACT_FRAGMENT = Symbol.for("react.fragment");

/**
 * Flattens a `children` node into an ordered list, dropping nullish/boolean
 * holes and unwrapping arrays and fragments so a run of authored siblings is
 * seen as siblings regardless of how the caller nested them.
 */
function flattenChildren(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = [];
  const walk = (node: ReactNode) => {
    if (node == null || typeof node === "boolean") {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }
      return;
    }
    if (isValidElement(node) && (node.type as unknown) === REACT_FRAGMENT) {
      walk((node.props as { children?: ReactNode }).children);
      return;
    }
    result.push(node);
  };
  walk(children);
  return result;
}

/** Reads the {@link MenuDrawerRole} of a child element, if it declares one. */
function menuDrawerRoleOf(node: ReactNode): MenuDrawerRole | undefined {
  if (!isValidElement(node)) {
    return;
  }
  const { type } = node;
  if (typeof type !== "function") {
    return;
  }
  return (type as { menuDrawerRole?: MenuDrawerRole }).menuDrawerRole;
}

/** Clones `node` with a stable key so it can live in a rendered array. */
function keyed(node: ReactNode, key: string): ReactNode {
  return isValidElement(node) ? cloneElement(node, { key }) : node;
}

/**
 * Groups a flat drawer child list into rounded `bg-muted` cards — the touch
 * presentation of a menu, mirroring the iOS/Linear "grouped list" look. Runs of
 * rows between separators become one card; section labels sit outside the cards
 * above their group. Non-row children (inputs, stats footers) still land in a
 * card, which reads as an inset panel.
 */
function GroupedDrawerBody({ children }: { children: ReactNode }) {
  const out: ReactNode[] = [];
  let group: ReactNode[] = [];
  let key = 0;

  const flush = () => {
    if (group.length === 0) {
      return;
    }
    out.push(
      <div
        // Row press states use a background-independent overlay
        // (`active:bg-foreground/10`) so they stay visible on the muted card,
        // where `bg-accent` would match the card and vanish.
        className="divide-y divide-border/60 overflow-hidden rounded-xl bg-muted/60 [&_button]:active:bg-foreground/10"
        key={`card-${key++}`}
      >
        {group}
      </div>
    );
    group = [];
  };

  for (const child of flattenChildren(children)) {
    const role = menuDrawerRoleOf(child);
    if (role === "break") {
      flush();
      continue;
    }
    if (role === "label") {
      flush();
      out.push(keyed(child, `label-${key++}`));
      continue;
    }
    group.push(keyed(child, `row-${key++}`));
  }
  flush();

  return <>{out}</>;
}

/**
 * Wraps drawer-mode menu/popover content in the scrollable body and supplies
 * the presentation context its rows read. Menus opt into `grouped` for the
 * card-backed list treatment; popovers (arbitrary content) leave it off.
 */
export function MenuPresentationProvider({
  children,
  close,
  className,
  grouped = false,
}: {
  children: ReactNode;
  className?: string;
  close: () => void;
  grouped?: boolean;
}) {
  return (
    <MenuPresentationContext.Provider value={{ close, presentation: "drawer" }}>
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pt-1 pb-2",
          grouped && "gap-2",
          className
        )}
      >
        {grouped ? <GroupedDrawerBody>{children}</GroupedDrawerBody> : children}
      </div>
    </MenuPresentationContext.Provider>
  );
}

/**
 * A submenu rendered as its own drawer stacked on top of its parent. vaul keeps
 * the parent mounted and scales it back behind this one; the back button (and a
 * swipe-down) dismiss only this level. Selecting a row closes the whole stack.
 */
export function MenuDrawerSubDrawer({
  children,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title?: ReactNode;
}) {
  // The parent menu's close — selecting a row in a submenu should dismiss the
  // entire stack, not just pop back one level. Read before this level opens its
  // own provider, so it resolves to the parent (root or ancestor submenu).
  const { close: closeParent } = useMenuPresentation();

  return (
    <DrawerNestedRoot onOpenChange={onOpenChange} open={open}>
      <DrawerContent hasTitle={false} variant="menu">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <button
            aria-label="Back"
            className="flex size-9 items-center justify-center rounded-lg text-muted-foreground active:bg-accent"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <IconChevronLeft className="size-5" />
          </button>
          {title ? (
            <span className="cn-font-heading flex min-w-0 items-center gap-2 font-medium text-base text-foreground [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0">
              {title}
            </span>
          ) : null}
        </div>
        <MenuPresentationProvider
          close={() => {
            onOpenChange(false);
            closeParent();
          }}
          grouped
        >
          {children}
        </MenuPresentationProvider>
      </DrawerContent>
    </DrawerNestedRoot>
  );
}

// --- Drawer-mode primitives -------------------------------------------------

const rowClassName = (destructive?: boolean) =>
  cn(
    "group/drawer-row flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm no-underline outline-none transition-colors active:bg-accent data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-5 [&_svg]:shrink-0",
    destructive
      ? "text-foreground hover:text-destructive active:text-destructive [&_svg]:text-muted-foreground hover:[&_svg]:text-destructive active:[&_svg]:text-destructive"
      : "text-foreground [&_svg]:text-muted-foreground"
  );

interface DrawerMenuRowProps {
  children: ReactNode;
  /** Merged after the base row classes (callers can compact/retint a row). */
  className?: string;
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
  className,
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
        className: cn(
          rowClassName(destructive),
          className,
          renderProps.className
        ),
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
      className={cn(rowClassName(destructive), className)}
      data-disabled={disabled ? "" : undefined}
      disabled={disabled}
      onClick={handleClick}
      type="button"
    >
      {body}
    </button>
  );
}

/**
 * Section label above a drawer row group. Sentence case like every other
 * menu label (no uppercase transform), and a flex row so trailing `ml-auto`
 * content (e.g. the column menu's Synced badge) sits at the right edge in
 * drawer mode exactly as it does in the popover presentation.
 */
export function DrawerMenuSectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center px-3 pt-2 pb-1 font-medium text-muted-foreground text-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DrawerMenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}
(DrawerMenuSeparator as { menuDrawerRole?: MenuDrawerRole }).menuDrawerRole =
  "break";
(DrawerMenuSectionLabel as { menuDrawerRole?: MenuDrawerRole }).menuDrawerRole =
  "label";

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
