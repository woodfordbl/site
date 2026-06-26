"use client";

import type { VariantProps } from "class-variance-authority";
import { type RefObject, useCallback } from "react";

import { GlyphIconPicker } from "@/components/pages/glyph-icon-picker.tsx";
import type { buttonVariants } from "@/components/ui/button.tsx";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { persistPageIcon } from "@/lib/pages/persist-page-icon.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";
import { cn } from "@/lib/utils.ts";

interface PageIconPickerSharedProps {
  icon?: string;
  pageId: string;
  pages: PageSummary[];
  previousSlug?: string;
  seed?: PageMetadataSeed;
  title: string;
}

interface PageIconPickerProps extends PageIconPickerSharedProps {
  anchor?: RefObject<Element | null>;
  className?: string;
  contentAlign?: "start" | "center" | "end";
  contentSide?: "top" | "right" | "bottom" | "left";
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  triggerButtonSize?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  triggerButtonVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerClassName?: string;
}

export function PageIconPicker({
  anchor,
  className,
  contentAlign = "start",
  contentSide = "bottom",
  hideTrigger = false,
  icon,
  onOpenChange,
  open,
  pageId,
  pages,
  previousSlug,
  seed,
  title,
  triggerButtonSize = "icon-lg",
  triggerButtonVariant,
  triggerClassName,
}: PageIconPickerProps) {
  const persistIcon = useCallback(
    (nextIcon: string) => {
      persistPageIcon({
        pageId,
        icon: nextIcon,
        title,
        previousSlug,
        seed,
        pages,
      });
    },
    [pageId, pages, previousSlug, seed, title]
  );

  return (
    <GlyphIconPicker
      anchor={anchor}
      ariaLabel="Change page icon"
      className={cn("mt-0.5 shrink-0", className)}
      contentAlign={contentAlign}
      contentSide={contentSide}
      hideTrigger={hideTrigger}
      icon={icon}
      onOpenChange={onOpenChange}
      onSelect={persistIcon}
      open={open}
      triggerButtonSize={triggerButtonSize}
      triggerButtonVariant={triggerButtonVariant}
      triggerClassName={triggerClassName}
    />
  );
}
