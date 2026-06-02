import type { HeadingProps } from "@/lib/schemas/block-props.ts";

export const headingTypographyClassNames: Record<
  HeadingProps["level"],
  string
> = {
  1: "text-2xl font-semibold tracking-tight sm:text-3xl",
  2: "text-xl font-semibold tracking-tight sm:text-2xl",
  3: "text-lg font-semibold tracking-tight sm:text-xl",
  4: "text-base font-semibold tracking-tight text-foreground",
};

export const headingSurfaceClassName = "text-balance text-foreground";
