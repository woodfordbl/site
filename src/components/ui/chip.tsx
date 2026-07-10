import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils.ts";

/**
 * Segmented chip family shared by the database filter bar today and, later,
 * formula reference chips (CodeMirror widgets) and relation cell chips.
 *
 * - `Chip` — the container. The default variant is a bordered segment strip
 *   (`ChipSegment`/`ChipButton` children separated by `divide-x`); the dashed
 *   variants are self-contained add triggers ("+ Filter"/"+ Sort").
 * - `TokenChip` — the inline token look (formula property references,
 *   relation pills) with block-color tones.
 *
 * `pointer-coarse:` bumps: 24px-tall chip segments are too small a touch
 * target, so chips grow to 32px with wider segment padding on touch devices.
 */

const chipVariants = cva("flex rounded-md border border-border", {
  variants: {
    variant: {
      default:
        "h-6 pointer-coarse:h-8 shrink-0 items-stretch divide-x divide-border overflow-hidden bg-background text-xs",
      dashed:
        "h-6 pointer-coarse:h-8 shrink-0 items-center gap-1 border-dashed pointer-coarse:px-2 px-1.5 text-muted-foreground text-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
      /**
       * Full-width dashed add trigger for the mobile filter/sort drawers —
       * fills the surface width inside the container's own padding.
       */
      "dashed-wide":
        "h-9 w-full items-center justify-center gap-1.5 border-dashed px-2 text-muted-foreground text-sm outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const chipSegmentClassName =
  "flex items-center gap-1 px-1.5 text-muted-foreground outline-none transition-colors pointer-coarse:px-2";

const chipButtonClassName = cn(
  chipSegmentClassName,
  "hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground"
);

const tokenChipVariants = cva(
  "inline-flex min-w-0 max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-foreground",
        blue: "bg-(--block-bg-blue) text-(--block-text-blue)",
        purple: "bg-(--block-bg-purple) text-(--block-text-purple)",
        destructive: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
);

/** Segmented chip container; dashed variants double as standalone triggers. */
function Chip({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"div"> & VariantProps<typeof chipVariants>) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(chipVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "chip",
      variant,
    },
  });
}

/** Static (non-interactive) chip segment. */
function ChipSegment({
  className,
  render,
  ...props
}: useRender.ComponentProps<"span">) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(chipSegmentClassName, className),
      },
      props
    ),
    render,
    state: {
      slot: "chip-segment",
    },
  });
}

/**
 * Interactive chip segment — a plain button by default, or composable into
 * Base UI triggers via their `render` prop (`render={<ChipButton>…</ChipButton>}`).
 */
function ChipButton({
  className,
  render,
  ...props
}: useRender.ComponentProps<"button">) {
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(chipButtonClassName, className),
        type: "button",
      },
      props
    ),
    render,
    state: {
      slot: "chip-button",
    },
  });
}

/**
 * Inline token chip (formula property/db references, relation cells). Tones
 * map to the block color tokens; `destructive` marks broken references.
 */
function TokenChip({
  className,
  tone = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof tokenChipVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(tokenChipVariants({ tone }), className),
      },
      props
    ),
    render,
    state: {
      slot: "token-chip",
      tone,
    },
  });
}

export { Chip, ChipButton, ChipSegment, chipVariants, TokenChip };
