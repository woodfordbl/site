"use client";

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { breadcrumbIconFallback } from "@/components/pages/page-breadcrumb-shared.tsx";
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
import { setDatabaseIcon } from "@/db/queries/database-collection-ops.ts";
import {
  renameDatabase,
  setDatabaseName,
} from "@/db/queries/database-page-ops.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageMetadataEditor } from "@/hooks/use-page-metadata-editor.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { navigateAfterDatabaseHubRename } from "@/lib/databases/navigate-after-database-rename.ts";
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
  const navigate = useNavigate();
  const localPage = useLocalPageById(pageId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const {
    handleTitleBlur: handlePageTitleBlur,
    handleTitleChange: handlePageTitleChange,
    handleTitleFocus: handlePageTitleFocus,
    icon,
    previousSlugRef,
    resolvedTitle,
    title: pageTitle,
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

  const pageSummary = pages.find((page) => page.id === pageId);
  const databaseId =
    localPage?.databaseSource?.databaseId ??
    pageSummary?.databaseSource?.databaseId;
  const isDatabaseHub = databaseId !== undefined;

  const persistedDbTitle = localPage?.title ?? defaultTitle;
  const [dbTitle, setDbTitle] = useState(persistedDbTitle);
  const [prevPersistedDbTitle, setPrevPersistedDbTitle] =
    useState(persistedDbTitle);
  const isEditingDbRef = useRef(false);

  if (
    isDatabaseHub &&
    !isEditingDbRef.current &&
    persistedDbTitle !== prevPersistedDbTitle
  ) {
    setPrevPersistedDbTitle(persistedDbTitle);
    setDbTitle(persistedDbTitle);
  }

  const displayTitle = localPage?.title ?? defaultTitle;
  const displayIcon = localPage?.icon ?? defaultIcon;
  const previousSlug = previousSlugRef.current;
  const iconFallback = breadcrumbIconFallback(isDatabaseHub);
  const title = isDatabaseHub ? dbTitle : pageTitle;

  const handleIconSelect = useCallback(
    (nextIcon: string) => {
      if (databaseId) {
        setDatabaseIcon(databaseId, nextIcon);
        return;
      }
      persistPageIcon({
        pageId,
        icon: nextIcon,
        title: resolvedTitle,
        previousSlug,
        seed: localPage ? undefined : seed,
        pages,
      });
    },
    [databaseId, localPage, pageId, pages, previousSlug, resolvedTitle, seed]
  );

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      if (!databaseId) {
        handlePageTitleChange(nextTitle);
        return;
      }
      setDbTitle(nextTitle);
      if (nextTitle.trim() === "") {
        return;
      }
      setDatabaseName(databaseId, nextTitle);
    },
    [databaseId, handlePageTitleChange]
  );

  const handleTitleBlur = useCallback(() => {
    if (!databaseId) {
      handlePageTitleBlur();
      return;
    }
    isEditingDbRef.current = false;
    const resolved =
      dbTitle.trim() === "" ? DEFAULT_PAGE_TITLE : dbTitle.trim();
    if (dbTitle.trim() === "") {
      setDbTitle(DEFAULT_PAGE_TITLE);
    }
    const change = renameDatabase(databaseId, resolved);
    navigateAfterDatabaseHubRename(navigate, change);
  }, [databaseId, dbTitle, handlePageTitleBlur, navigate]);

  const handleTitleFocus = useCallback(() => {
    if (databaseId) {
      isEditingDbRef.current = true;
      return;
    }
    handlePageTitleFocus();
  }, [databaseId, handlePageTitleFocus]);

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
              <PageIconDisplay fallback={iconFallback} icon={displayIcon} />
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
            iconFallback={iconFallback}
            iconPickerOpen={iconPickerOpen}
            inputRef={inputRef}
            isDatabaseHub={isDatabaseHub}
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
  iconFallback,
  iconPickerOpen,
  inputRef,
  isDatabaseHub,
  onIconPickerOpenChange,
  onIconSelect,
  onTitleBlur,
  onTitleChange,
  onTitleFocus,
  title,
}: {
  icon?: string;
  iconFallback?: React.ReactNode;
  iconPickerOpen: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  isDatabaseHub: boolean;
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
        ariaLabel={isDatabaseHub ? "Change database icon" : "Change page icon"}
        fallbackIcon={
          <PageIconDisplay
            className="[&_svg]:size-4"
            fallback={iconFallback}
            icon={undefined}
          />
        }
        icon={icon}
        onOpenChange={onIconPickerOpenChange}
        onSelect={onIconSelect}
        open={iconPickerOpen}
      />
      <InputGroupInput
        aria-label={isDatabaseHub ? "Database title" : "Page title"}
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
