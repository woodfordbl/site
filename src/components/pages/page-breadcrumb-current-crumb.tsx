"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { Button, iconSlotClassName } from "@/components/ui/button.tsx";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group.tsx";
import { InputGroupIconPicker } from "@/components/ui/input-group-icon-picker.tsx";
import { shouldCancelMenuCloseForIconPicker } from "@/components/ui/menu-icon-rename-input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageMetadataEditor } from "@/hooks/use-page-metadata-editor.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { persistPageIcon } from "@/lib/pages/persist-page-icon.ts";
import type { PageMetadataSeed } from "@/lib/pages/persist-page-metadata.ts";

interface PageBreadcrumbCurrentCrumbProps {
  defaultIcon?: string;
  defaultSlug: string;
  defaultTitle: string;
  pageId: string;
  pages: PageSummary[];
  seed?: PageMetadataSeed;
}

export function PageBreadcrumbCurrentCrumb({
  defaultIcon,
  defaultSlug,
  defaultTitle,
  pageId,
  pages,
  seed,
}: PageBreadcrumbCurrentCrumbProps) {
  const localPage = useLocalPageById(pageId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const {
    handleTitleBlur,
    handleTitleChange,
    handleTitleFocus,
    icon,
    previousSlugRef,
    resolvedTitle,
    title,
  } = usePageMetadataEditor({
    defaultIcon,
    defaultSlug,
    defaultTitle,
    localPage,
    pageId,
    pages,
    seed,
    syncUrlOnBlur: true,
  });

  const displayTitle = localPage?.title ?? defaultTitle;
  const displayIcon = localPage?.icon ?? defaultIcon;

  const handleIconSelect = useCallback(
    (nextIcon: string) => {
      persistPageIcon({
        pageId,
        icon: nextIcon,
        title: resolvedTitle,
        previousSlug: previousSlugRef.current,
        seed: localPage ? undefined : seed,
        pages,
      });
    },
    [localPage, pageId, pages, resolvedTitle, seed]
  );

  return (
    <Popover
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          shouldCancelMenuCloseForIconPicker(
            nextOpen,
            iconPickerOpen,
            eventDetails
          )
        ) {
          return;
        }

        if (nextOpen) {
          setIconPickerOpen(false);
        } else {
          handleTitleBlur();
          setIconPickerOpen(false);
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost">
            <span className={iconSlotClassName("icon-sm")}>
              <PageIconDisplay icon={displayIcon} />
            </span>
            <span className="min-w-0 truncate">
              {displayTitle || DEFAULT_PAGE_TITLE}
            </span>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 gap-1.5 p-1" side="bottom">
        {open ? (
          <PageBreadcrumbCurrentCrumbEditor
            icon={icon}
            iconPickerOpen={iconPickerOpen}
            inputRef={inputRef}
            onIconPickerOpenChange={setIconPickerOpen}
            onIconSelect={handleIconSelect}
            onTitleBlur={handleTitleBlur}
            onTitleChange={handleTitleChange}
            onTitleFocus={handleTitleFocus}
            title={title}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PageBreadcrumbCurrentCrumbEditor({
  icon,
  iconPickerOpen,
  inputRef,
  onIconPickerOpenChange,
  onIconSelect,
  onTitleBlur,
  onTitleChange,
  onTitleFocus,
  title,
}: {
  icon?: string;
  iconPickerOpen: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onIconPickerOpenChange: (open: boolean) => void;
  onIconSelect: (icon: string) => void;
  onTitleBlur: () => void;
  onTitleChange: (nextTitle: string) => void;
  onTitleFocus: () => void;
  title: string;
}) {
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [inputRef]);

  return (
    <InputGroup className="h-8 pointer-coarse:h-10">
      <InputGroupIconPicker
        ariaLabel="Change page icon"
        fallbackIcon={
          <PageIconDisplay className="[&_svg]:size-4" icon={undefined} />
        }
        icon={icon}
        onOpenChange={onIconPickerOpenChange}
        onSelect={onIconSelect}
        open={iconPickerOpen}
      />
      <InputGroupInput
        aria-label="Page title"
        autoComplete="off"
        onBlur={onTitleBlur}
        onChange={(event) => onTitleChange(event.target.value)}
        onFocus={onTitleFocus}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onTitleBlur();
          }
        }}
        ref={inputRef}
        type="text"
        value={title}
      />
    </InputGroup>
  );
}
