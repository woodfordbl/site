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
