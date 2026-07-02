import { BLOCK_COLOR_DEFS } from "@/lib/blocks/block-colors.ts";
import type { BlockColor } from "@/lib/schemas/rich-text.ts";
import { cn } from "@/lib/utils.ts";

/** Palette swatch for color menus: an "A" glyph for text, a filled square for backgrounds. */
export function BlockColorSwatch({
  color,
  variant,
}: {
  color: BlockColor | undefined;
  variant: "text" | "background";
}) {
  if (variant === "text") {
    return (
      <span
        aria-hidden
        className={cn(
          "flex size-5 items-center justify-center rounded border border-border font-medium text-sm",
          color && BLOCK_COLOR_DEFS[color].textClass
        )}
      >
        A
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "size-5 rounded border border-border",
        color ? BLOCK_COLOR_DEFS[color].bgClass : "bg-background"
      )}
    />
  );
}
