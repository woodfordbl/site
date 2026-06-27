import type { HeadingProps } from "@/lib/schemas/block-props.ts";

// Sizes multiply by `--page-text-scale` so headings track the page text scale
// (see styles.css `[data-page-text-scale]`).
export const headingTypographyClassNames: Record<
  HeadingProps["level"],
  string
> = {
  1: "text-[length:calc(1.5rem*var(--page-text-scale))] font-semibold tracking-tight sm:text-[length:calc(1.875rem*var(--page-text-scale))] sm:leading-[1.25]",
  2: "text-[length:calc(1.25rem*var(--page-text-scale))] font-semibold tracking-tight sm:text-[length:calc(1.5rem*var(--page-text-scale))]",
  3: "text-[length:calc(1.125rem*var(--page-text-scale))] font-semibold tracking-tight sm:text-[length:calc(1.25rem*var(--page-text-scale))]",
  4: "text-[length:calc(1rem*var(--page-text-scale))] font-semibold tracking-tight text-foreground",
};

export const headingSurfaceClassName = "text-balance text-foreground";
