import type { HeadingProps } from "@/lib/schemas/block-props.ts";

// Sizes read the `--fs-h*` tokens so headings track the page text scale (see
// styles.css `[data-page-text-scale]`).
export const headingTypographyClassNames: Record<
  HeadingProps["level"],
  string
> = {
  1: "text-[length:var(--fs-h1)] font-semibold tracking-tight sm:text-[length:var(--fs-h1-sm)] sm:leading-[1.25]",
  2: "text-[length:var(--fs-h2)] font-semibold tracking-tight sm:text-[length:var(--fs-h2-sm)]",
  3: "text-[length:var(--fs-h3)] font-semibold tracking-tight sm:text-[length:var(--fs-h3-sm)]",
  4: "text-[length:var(--fs-h4)] font-semibold tracking-tight text-foreground",
};

export const headingSurfaceClassName = "text-balance text-foreground";
