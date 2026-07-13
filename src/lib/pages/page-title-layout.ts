import { buttonIconChildClassNames } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/** Page title row: stacked icon + title on mobile; side-by-side from `sm`. */
export const pageTitleEditorLayoutClassName =
  "flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:gap-0";

/** Icon slot beside (sm+) or above (mobile) the page title. */
export const pageTitleIconSlotClassName = "w-auto shrink-0 sm:w-9";

/**
 * Constrained-column (not full-width) top-level block indent — aligns with the
 * title *text* column from `md` only (`sm:w-9` icon slot). Full-width pages
 * omit this so blocks share the page-icon left edge inside scroll padding.
 */
export const pageTitleBlockAlignClassName = "max-md:pl-0 md:pl-9";

/** Page icon picker alignment with stacked (mobile) vs inline (sm+) title. */
export const pageTitleIconPickerClassName = "mt-0 sm:mt-0.5";

/**
 * Mobile canvas scroll inset — fits one `icon-xs` gutter in the padding lane.
 *
 * `pb-[50vh]`: the on-screen keyboard covers the bottom of the viewport, so a
 * trailing block has nothing below it to scroll against and can sit pinned
 * behind the keyboard where it can't be tapped/edited. A half-viewport of
 * bottom scroll room lets any block be scrolled up clear of the keyboard. The
 * `md:pb-12` override restores the tight desktop inset (no keyboard there).
 */
export const pageCanvasMobileScrollClassName =
  "no-scrollbar pr-4 pb-[50vh] pl-7 md:overflow-auto md:px-12 md:pt-16 md:pb-12";

/**
 * Touch (coarse pointer) canvas scroll inset. The drag gutter is not rendered on
 * coarse pointers, so the reserved gutter lane is dropped and the content left
 * edge lines up with the mobile header's sidebar button (`px-3`) instead.
 *
 * Carries the same `pb-[50vh]` keyboard scroll room as
 * {@link pageCanvasMobileScrollClassName}.
 */
export const pageCanvasTouchScrollClassName =
  "no-scrollbar pr-4 pb-[50vh] pl-3 md:overflow-auto md:px-12 md:pt-16 md:pb-12";

/** Desktop canvas top scroll inset — title column starts below this. */
export const pageCanvasDesktopScrollTopInsetClassName = "md:pt-16";

/**
 * Mobile header slot (cover-less pages). Negative margins cancel the scroll
 * padding so the header sits flush to the panel edge (gutter-lane variant).
 *
 * `bg-background pt-[env(safe-area-inset-top)]`: with `viewport-fit=cover` (set
 * in __root) the scroll region extends to the physical top of the webview, so
 * this header — the first thing in the scroll region — sits behind the system
 * chrome (iOS notch / collapsed Safari address bar / PWA status bar). The
 * safe-area top inset pads the breadcrumb row down so it stays clear of the
 * chrome, and the opaque background fills that inset with `bg-background` so the
 * `bg-sidebar` layered behind the content (see {@link PageSidebarSwipeReveal})
 * can't show through. In ordinary Safari browsing the inset is `0` (no-op).
 */
const HEADER_SLOT_SAFE_AREA = "bg-background pt-[env(safe-area-inset-top)]";

export const pageCanvasMobileHeaderSlotClassName = `-mr-4 mb-4 -ml-7 ${HEADER_SLOT_SAFE_AREA} md:hidden`;

/** Touch header slot inset — matches {@link pageCanvasTouchScrollClassName}. */
export const pageCanvasTouchHeaderSlotClassName = `-mr-4 mb-4 -ml-3 ${HEADER_SLOT_SAFE_AREA} md:hidden`;

/**
 * Sticky variant of the mobile header slot, used **only when the page has a
 * cover image**. The bar pins (`sticky top-0`) with a **solid, opaque**
 * background so the cover scrolls up and is cleanly occluded by the pinned bar
 * (no translucency or backdrop blur — content does not show through). Cover-less
 * pages keep {@link pageCanvasMobileHeaderSlotClassName} (the header scrolls away
 * as before).
 *
 * `pt-[env(safe-area-inset-top)]`: with `viewport-fit=cover` (set in __root) the
 * scroll region extends to the physical top of the webview, so once the bar is
 * pinned at `top-0` it can sit *behind* the system chrome (the iOS notch / a
 * collapsed Safari address bar, a standalone PWA status bar, or a landscape
 * notch). The safe-area top inset grows the solid background up into that region
 * and pads the breadcrumb row down so it stays clear of the chrome. In ordinary
 * Safari browsing the inset is `0`, so this is a no-op there — the bar simply
 * tucks under the address bar.
 */
const STICKY_HEADER_BASE =
  "sticky top-0 z-20 bg-background pt-[env(safe-area-inset-top)]";

export const pageCanvasMobileHeaderSlotStickyClassName = `-mr-4 -ml-7 mb-4 ${STICKY_HEADER_BASE} md:hidden`;

/** Touch sticky header slot — matches {@link pageCanvasTouchScrollClassName}. */
export const pageCanvasTouchHeaderSlotStickyClassName = `-mr-4 -ml-3 mb-4 ${STICKY_HEADER_BASE} md:hidden`;

/**
 * Desktop cover header slot. With a cover present the breadcrumb bar sits below
 * the full-bleed cover image and pins to the top on scroll (`sticky -top-16`,
 * cancelling desktop `pt-16` scroll inset) so page content scrolls beneath it.
 * (cancels desktop `px-12`) with a solid opaque background. Shown only at `md+`;
 * mobile keeps its own header slot.
 *
 * `mb-16`: the cover's `-mt-16` bleed cancels the scroll region's `pt-16`, which
 * is the 4rem of breathing room the title normally gets above it. Restore that
 * gap below the breadcrumb bar so a covered page's title isn't flush against it.
 */
export const pageCoverDesktopHeaderSlotClassName =
  "sticky -top-16 z-20 mb-16 -mx-12 w-[calc(100%+6rem)] bg-background max-md:hidden";

/**
 * Full-width cover ("header image") wrapper. Negative margins cancel the scroll
 * region padding so the cover spans the canvas card edge to edge; on desktop the
 * top inset is also cancelled so the image sits flush under the card's rounded
 * top corners (`md:rounded-t-xl`, matching the inset panel's `md:rounded-xl`).
 *
 * Fine-pointer mobile gutter: `pl-7` (1.75rem) + `pr-4` (1rem) = 2.75rem;
 * desktop `px-12` = 6rem.
 */
export const pageCoverMobileClassName =
  "-mr-4 -ml-7 w-[calc(100%+2.75rem)] md:-mx-12 md:-mt-16 md:w-[calc(100%+6rem)] md:rounded-t-xl";

/** Touch cover bleed — `pl-3` (0.75rem) + `pr-4` (1rem) = 1.75rem; desktop 6rem. */
export const pageCoverTouchClassName =
  "-mr-4 -ml-3 w-[calc(100%+1.75rem)] md:-mx-12 md:-mt-16 md:w-[calc(100%+6rem)] md:rounded-t-xl";

/** Absolute gutter position on mobile (sits in the scroll padding lane). */
export const pageCanvasGutterMobileClassName = "-left-7";

/**
 * Desktop gutter negative margin pull into scroll padding. Matches the
 * `icon-xs` grip (`size-6` / 1.5rem) so block content stays flush with the
 * page title icon; larger pulls overshoot into the padding lane.
 */
export const pageCanvasGutterPullClassName = "-ml-6";

/** Responsive trigger sizing for {@link PageIconPicker} beside H1 (`text-2xl` / `sm:text-3xl`). */
export const pageTitleIconButtonClassName = cn(
  "size-8",
  buttonIconChildClassNames.icon,
  "sm:size-9 sm:[&_[role=img]]:text-[1.5rem] sm:[&_svg:not([class*='size-'])]:size-7"
);
