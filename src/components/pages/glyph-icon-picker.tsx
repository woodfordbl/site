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
  prefetchPageIconCatalogs,
  preloadPageIconEmojiPanel,
  preloadPageIconIconPanel,
} from "@/lib/pages/preload-page-icon-picker.ts";
import { cn } from "@/lib/utils.ts";

/** Placeholder chrome (search + scroll box) shown while a lazy panel chunk resolves. */
function GlyphIconPickerPanelShell() {
  return (
    <div className="flex w-full min-w-0 flex-col">
      <div
        aria-hidden
        className="mb-2 h-8 shrink-0 rounded-lg border border-input"
      />
      <div aria-hidden className="h-[320px] w-full" />
    </div>
  );
}

function GlyphIconPickerPopoverContent({
  EmojiPanel,
  IconPanel,
  onSelect,
  open,
}: {
  EmojiPanel: ComponentType<PageIconPickerEmojiPanelProps> | null;
  IconPanel: ComponentType<PageIconPickerIconPanelProps> | null;
  onSelect: (nextIcon: string) => void;
  open: boolean;
}) {
  return (
    <Tabs className="w-full gap-0" defaultValue="emoji">
      <div className="px-2 pt-2 pb-2">
        <TabsList
          className="flex h-9 w-fit rounded-none p-0"
          variant="indicator"
        >
          <TabsTrigger value="emoji">Emoji</TabsTrigger>
          <TabsTrigger value="icons">Icons</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent
        className="m-0 flex min-h-0 flex-col px-2 pt-0 pb-2"
        value="emoji"
      >
        {open && EmojiPanel ? (
          <EmojiPanel onSelect={onSelect} />
        ) : (
          <GlyphIconPickerPanelShell />
        )}
      </TabsContent>
      <TabsContent
        className="m-0 flex min-h-0 flex-col px-2 pt-0 pb-2"
        value="icons"
      >
        {open && IconPanel ? (
          <IconPanel onSelect={onSelect} />
        ) : (
          <GlyphIconPickerPanelShell />
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
    prefetchPageIconCatalogs(queryClient);
  }, [queryClient]);

  useEffect(() => {
    const idleId = requestIdleCallback(() => {
      ensurePanels();
    });
    return () => {
      cancelIdleCallback(idleId);
    };
  }, [ensurePanels]);

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
      onSelect(nextIcon);
      setOpen(false);
    },
    [onSelect, setOpen]
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        ensurePanels();
      }
      setOpen(nextOpen);
    },
    [ensurePanels, setOpen]
  );

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
          onSelect={handleSelect}
          open={open}
        />
      </PopoverContent>
    </Popover>
  );
}
