import { useCallback, useRef, useState } from "react";

import type { useLocalPageById } from "@/hooks/use-local-pages.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import {
  type PageMetadataSeed,
  persistPageMetadata,
} from "@/lib/pages/persist-page-metadata.ts";

interface UsePageMetadataEditorOptions {
  defaultIcon?: string;
  defaultSlug: string;
  defaultTitle: string;
  localPage: ReturnType<typeof useLocalPageById>;
  pageId: string;
  pages: PageSummary[];
  seed?: PageMetadataSeed;
  syncUrlOnBlur?: boolean;
}

export function usePageMetadataEditor({
  defaultIcon,
  defaultSlug,
  defaultTitle,
  localPage,
  pageId,
  pages,
  seed,
  syncUrlOnBlur = true,
}: UsePageMetadataEditorOptions) {
  const persistedTitle = localPage?.title ?? defaultTitle;
  const persistedSlug = localPage?.slug ?? defaultSlug;
  const persistedIcon = localPage?.icon ?? defaultIcon;

  const [title, setTitle] = useState(persistedTitle);
  const [prevPersistedTitle, setPrevPersistedTitle] = useState(persistedTitle);
  const [prevPersistedSlug, setPrevPersistedSlug] = useState(persistedSlug);
  const previousSlugRef = useRef(persistedSlug);
  const isEditingRef = useRef(false);

  if (!isEditingRef.current && persistedTitle !== prevPersistedTitle) {
    setPrevPersistedTitle(persistedTitle);
    setTitle(persistedTitle);
  }

  if (persistedSlug !== prevPersistedSlug) {
    setPrevPersistedSlug(persistedSlug);
    previousSlugRef.current = persistedSlug;
  }

  const resolvedTitle = title.trim() === "" ? DEFAULT_PAGE_TITLE : title.trim();

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle);

      if (nextTitle.trim() === "") {
        return;
      }

      persistPageMetadata({
        pageId,
        slug: previousSlugRef.current,
        previousSlug: previousSlugRef.current,
        title: nextTitle,
        seed: localPage ? undefined : seed,
        pages,
      });
    },
    [localPage, pageId, pages, seed]
  );

  const handleTitleBlur = useCallback(() => {
    isEditingRef.current = false;

    const nextTitle = title.trim() === "" ? DEFAULT_PAGE_TITLE : title;

    if (title.trim() === "") {
      setTitle(DEFAULT_PAGE_TITLE);
    }

    const { slug } = persistPageMetadata({
      pageId,
      previousSlug: previousSlugRef.current,
      title: nextTitle,
      seed: localPage ? undefined : seed,
      pages,
      syncUrl: syncUrlOnBlur,
    });
    previousSlugRef.current = slug;
  }, [localPage, pageId, pages, seed, syncUrlOnBlur, title]);

  const handleTitleFocus = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  return {
    handleTitleBlur,
    handleTitleChange,
    handleTitleFocus,
    icon: persistedIcon,
    previousSlugRef,
    resolvedTitle,
    title,
  };
}
