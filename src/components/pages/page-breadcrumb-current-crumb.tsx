"use client";

import { useEffect, useRef, useState } from "react";
import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import { Button, iconSlotClassName } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageMetadataEditor } from "@/hooks/use-page-metadata-editor.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
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

  return (
    <Popover
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleTitleBlur();
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
      <PopoverContent align="start" className="w-72 p-2" side="bottom">
        {open ? (
          <PageBreadcrumbCurrentCrumbEditor
            icon={icon}
            inputRef={inputRef}
            onTitleBlur={handleTitleBlur}
            onTitleChange={handleTitleChange}
            onTitleFocus={handleTitleFocus}
            pageId={pageId}
            pages={pages}
            previousSlug={previousSlugRef.current}
            resolvedTitle={resolvedTitle}
            seed={localPage ? undefined : seed}
            title={title}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PageBreadcrumbCurrentCrumbEditor({
  icon,
  inputRef,
  onTitleBlur,
  onTitleChange,
  onTitleFocus,
  pageId,
  pages,
  previousSlug,
  resolvedTitle,
  seed,
  title,
}: {
  icon?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onTitleBlur: () => void;
  onTitleChange: (nextTitle: string) => void;
  onTitleFocus: () => void;
  pageId: string;
  pages: PageSummary[];
  previousSlug: string;
  resolvedTitle: string;
  seed?: PageMetadataSeed;
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
    <div className="flex items-center gap-2">
      <PageIconPicker
        className="mt-0 shrink-0"
        icon={icon}
        pageId={pageId}
        pages={pages}
        previousSlug={previousSlug}
        seed={seed}
        title={resolvedTitle}
        triggerButtonSize="icon"
        triggerButtonVariant="outline"
      />
      <Input
        aria-label="Page title"
        className="min-w-0 flex-1"
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
    </div>
  );
}
