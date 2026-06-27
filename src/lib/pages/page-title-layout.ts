import { buttonIconChildClassNames } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/** Page title row: stacked icon + title on mobile; side-by-side from `sm`. */
export const pageTitleEditorLayoutClassName =
  "flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:gap-0";

/** Icon slot beside (sm+) or above (mobile) the page title. */
export const pageTitleIconSlotClassName = "w-auto shrink-0 sm:w-9";

/** View-mode top-level block indent — aligns with title text column from `md` only. */
export const pageTitleBlockAlignClassName = "max-md:pl-0 md:pl-9";

/** Page icon picker alignment with stacked (mobile) vs inline (sm+) title. */
export const pageTitleIconPickerClassName = "mt-0 sm:mt-0.5";

/** Mobile canvas scroll inset — fits one `icon-xs` gutter in the padding lane. */
export const pageCanvasMobileScrollClassName =
  "overflow-auto pr-4 pb-4 pl-7 md:px-12 md:py-12 md:pb-12";

/**
 * Touch (coarse pointer) canvas scroll inset. The drag gutter is not rendered on
 * coarse pointers, so the reserved gutter lane is dropped and the content left
 * edge lines up with the mobile header's sidebar button (`px-3`) instead.
 */
export const pageCanvasTouchScrollClassName =
  "overflow-auto pr-4 pb-4 pl-3 md:px-12 md:py-12 md:pb-12";

/** Mobile header slot inset — negative margins cancel the scroll padding so the
 *  header sits flush to the panel edge (gutter-lane variant). */
export const pageCanvasMobileHeaderSlotClassName = "-mr-4 mb-4 -ml-7 md:hidden";

/** Touch header slot inset — matches {@link pageCanvasTouchScrollClassName}. */
export const pageCanvasTouchHeaderSlotClassName = "-mr-4 mb-4 -ml-3 md:hidden";

/**
 * Sticky + frosted variant of the mobile header slot, used **only when the page
 * has a cover image**. The bar pins (`sticky top-0`) with a translucent
 * background + backdrop blur so the cover (and page content) scrolling beneath
 * it reads as frosted glass — the same language as iOS Safari's own chrome.
 * Falls back to a near-opaque background where `backdrop-filter` is
 * unsupported. Cover-less pages keep {@link pageCanvasMobileHeaderSlotClassName}
 * (the header scrolls away as before).
 */
const STICKY_HEADER_FROST =
  "sticky top-0 z-20 bg-background/85 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/65";

export const pageCanvasMobileHeaderSlotStickyClassName = `-mr-4 -ml-7 mb-4 ${STICKY_HEADER_FROST} md:hidden`;

/** Touch sticky header slot — matches {@link pageCanvasTouchScrollClassName}. */
export const pageCanvasTouchHeaderSlotStickyClassName = `-mr-4 -ml-3 mb-4 ${STICKY_HEADER_FROST} md:hidden`;

/**
 * Desktop cover header slot. With a cover present the breadcrumb bar is overlaid
 * on the **base of the cover image** (pulled up by its own `h-12` height) and
 * pinned to the top on scroll (`sticky top-0`) so page content scrolls beneath
 * it. Full-bleed (cancels the desktop `px-12` inset + grows width past the
 * overlay scrollbar) with a translucent light gradient + backdrop blur for
 * contrast — over the image at rest and over content once pinned. Shown only at
 * `md+`; mobile keeps its own header slot.
 */
export const pageCoverDesktopHeaderSlotClassName =
  "-mt-12 -mx-12 sticky top-0 z-20 w-[calc(100%+6rem)] bg-gradient-to-b from-background/55 to-background/90 backdrop-blur-md backdrop-saturate-150 max-md:hidden";

/**
 * Full-bleed cover ("header image") wrapper. Negative margins cancel the scroll
 * region padding — the mobile gutter lane (`pl-7`) and desktop `px-12`/`py-12` —
 * AND the width is grown by that same horizontal padding (`w-[calc(100%+…)]`)
 * so the cover actually spans edge to edge (negative margins alone don't widen a
 * `w-full` element when the scrollbar is an overlay). Mobile has no top padding
 * to cancel, so only the desktop top inset is pulled.
 *
 * Fine-pointer mobile gutter: `pl-7` (1.75rem) + `pr-4` (1rem) = 2.75rem;
 * desktop `px-12` = 6rem.
 */
// `md:mb-0`: on desktop the breadcrumb header overlays the cover's base (it is
// pulled up onto the cover), so the cover needs no bottom margin there.
export const pageCoverMobileClassName =
  "-mr-4 -ml-7 mb-3 w-[calc(100%+2.75rem)] md:-mx-12 md:-mt-12 md:mb-0 md:w-[calc(100%+6rem)]";

/** Touch cover inset — `pl-3` (0.75rem) + `pr-4` (1rem) = 1.75rem; desktop 6rem. */
export const pageCoverTouchClassName =
  "-mr-4 -ml-3 mb-3 w-[calc(100%+1.75rem)] md:-mx-12 md:-mt-12 md:mb-0 md:w-[calc(100%+6rem)]";

/** Absolute gutter position on mobile (sits in the scroll padding lane). */
export const pageCanvasGutterMobileClassName = "-left-7";

/** Desktop gutter negative margin pull into scroll padding. */
export const pageCanvasGutterPullClassName = "-ml-8 md:-ml-12";

/** Responsive trigger sizing for {@link PageIconPicker} beside H1 (`text-2xl` / `sm:text-3xl`). */
export const pageTitleIconButtonClassName = cn(
  "size-8",
  buttonIconChildClassNames.icon,
  "sm:size-9 sm:[&_[role=img]]:text-[1.5rem] sm:[&_svg:not([class*='size-'])]:size-7"
);
