"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { VariantProps } from "class-variance-authority";
import {
  type ComponentType,
  type RefObject,
  useCallback,
  useEffect,
  useState,
} from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import type { PageIconPickerEmojiPanelProps } from "@/components/pages/page-icon-picker-emoji-panel.tsx";
import type { PageIconPickerIconPanelProps } from "@/components/pages/page-icon-picker-icon-panel.tsx";
import { Button, type buttonVariants } from "@/components/ui/button.tsx";
import { useMenuPresentation } from "@/components/ui/menu-presentation.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import {
  ensurePageIconPickerReady,
  preloadPageIconEmojiPanel,
  preloadPageIconIconPanel,
} from "@/lib/pages/preload-page-icon-picker.ts";
import { recordRecentlyUsedPageIcon } from "@/lib/pages/recently-used-page-icons.ts";
import { cn } from "@/lib/utils.ts";

/** Placeholder chrome (search + scroll box) shown while a lazy panel chunk resolves. */
function GlyphIconPickerPanelShell({ fillHeight }: { fillHeight: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col",
        fillHeight && "min-h-0 flex-1"
      )}
    >
      <div
        aria-hidden
        className="mb-2 h-8 shrink-0 rounded-lg border border-input"
      />
      <div
        aria-hidden
        className={cn("w-full", fillHeight ? "min-h-0 flex-1" : "h-[320px]")}
      />
    </div>
  );
}

function GlyphIconPickerPopoverContent({
  EmojiPanel,
  IconPanel,
  onRemove,
  onSelect,
  open,
}: {
  EmojiPanel: ComponentType<PageIconPickerEmojiPanelProps> | null;
  IconPanel: ComponentType<PageIconPickerIconPanelProps> | null;
  onRemove?: () => void;
  onSelect: (nextIcon: string) => void;
  open: boolean;
}) {
  // In drawer presentation (touch) the popover becomes a tall bottom sheet, so
  // let the tabs fill it and hand that height down to the grid panels.
  const fillHeight = useMenuPresentation().presentation === "drawer";

  return (
    <Tabs
      className={cn("w-full gap-0", fillHeight && "min-h-0 flex-1")}
      defaultValue="emoji"
    >
      {/* Underline tabs whose active indicator intersects a full-width divider,
          matching the link/upload embed tabs. */}
      <div className="relative flex w-full items-center justify-between gap-2 px-2 pt-2">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 border-border border-b"
        />
        <TabsList className="relative z-[1]" variant="line">
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icons">Icons</TabsTrigger>
        </TabsList>
        {onRemove ? (
          <Button
            className="relative z-[1] mb-1 h-7 shrink-0 text-muted-foreground"
            onClick={onRemove}
            size="sm"
            type="button"
            variant="ghost"
          >
            Remove
          </Button>
        ) : null}
      </div>
      <TabsContent
        className="m-0 flex min-h-0 flex-col px-2 pt-2 pb-2"
        value="emoji"
      >
        {open && EmojiPanel ? (
          <EmojiPanel onSelect={onSelect} />
        ) : (
          <GlyphIconPickerPanelShell fillHeight={fillHeight} />
        )}
      </TabsContent>
      <TabsContent
        className="m-0 flex min-h-0 flex-col px-2 pt-2 pb-2"
        value="icons"
      >
        {open && IconPanel ? (
          <IconPanel onSelect={onSelect} />
        ) : (
          <GlyphIconPickerPanelShell fillHeight={fillHeight} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function useGlyphIconPickerPanels() {
  const queryClient = useQueryClient();
  const [EmojiPanel, setEmojiPanel] =
    useState<ComponentType<PageIconPickerEmojiPanelProps> | null>(null);
  const [IconPanel, setIconPanel] =
    useState<ComponentType<PageIconPickerIconPanelProps> | null>(null);

  const ensurePanels = useCallback(() => {
    ensurePageIconPickerReady(queryClient);
    preloadPageIconEmojiPanel()
      .then((Panel) => setEmojiPanel(() => Panel))
      .catch(() => {
        /* prefetch is best-effort */
      });
    preloadPageIconIconPanel()
      .then((Panel) => setIconPanel(() => Panel))
      .catch(() => {
        /* prefetch is best-effort */
      });
  }, [queryClient]);

  return { EmojiPanel, IconPanel, ensurePanels };
}

export interface GlyphIconPickerProps {
  anchor?: RefObject<Element | null>;
  ariaLabel: string;
  className?: string;
  contentAlign?: "start" | "center" | "end";
  contentSide?: "top" | "right" | "bottom" | "left";
  hideTrigger?: boolean;
  icon?: string;
  onOpenChange?: (open: boolean) => void;
  /** When provided and an icon is set, shows a "Remove" action that clears it. */
  onRemove?: () => void;
  onSelect: (nextIcon: string) => void;
  open?: boolean;
  triggerButtonSize?: "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  triggerButtonVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerClassName?: string;
}

export function GlyphIconPicker({
  anchor,
  ariaLabel,
  className,
  contentAlign = "start",
  contentSide = "bottom",
  hideTrigger = false,
  icon,
  onOpenChange: onOpenChangeProp,
  onRemove,
  onSelect,
  open: openProp,
  triggerButtonSize = "icon-lg",
  triggerButtonVariant = "ghost",
  triggerClassName,
}: GlyphIconPickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const { EmojiPanel, IconPanel, ensurePanels } = useGlyphIconPickerPanels();

  const open = openProp ?? uncontrolledOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      onOpenChangeProp?.(nextOpen);
      if (openProp === undefined) {
        setUncontrolledOpen(nextOpen);
      }
    },
    [onOpenChangeProp, openProp]
  );

  const handleSelect = useCallback(
    (nextIcon: string) => {
      recordRecentlyUsedPageIcon(nextIcon);
      onSelect(nextIcon);
      setOpen(false);
    },
    [onSelect, setOpen]
  );

  const handleRemove = useCallback(() => {
    onRemove?.();
    setOpen(false);
  }, [onRemove, setOpen]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        ensurePanels();
      }
      setOpen(nextOpen);
    },
    [ensurePanels, setOpen]
  );

  // Controlled open (e.g. sidebar "Change icon") sets `open` directly and skips
  // `onOpenChange`, so preload panels whenever the popover becomes visible.
  useEffect(() => {
    if (open) {
      ensurePanels();
    }
  }, [ensurePanels, open]);

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      {hideTrigger ? null : (
        <PopoverTrigger
          className={cn("shrink-0", className)}
          onPointerEnter={ensurePanels}
          render={
            <Button
              aria-label={ariaLabel}
              className={triggerClassName}
              size={triggerButtonSize}
              variant={triggerButtonVariant}
            >
              <PageIconDisplay icon={icon} />
            </Button>
          }
        />
      )}
      <PopoverContent
        align={contentAlign}
        anchor={anchor}
        className="w-[352px] gap-0 p-0"
        finalFocus={false}
        initialFocus={false}
        side={contentSide}
      >
        <GlyphIconPickerPopoverContent
          EmojiPanel={EmojiPanel}
          IconPanel={IconPanel}
          onRemove={onRemove && icon ? handleRemove : undefined}
          onSelect={handleSelect}
          open={open}
        />
      </PopoverContent>
    </Popover>
  );
}
