import { useCallback, useEffect, useRef, useState } from "react";

import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import {
  type PageMetadataSeed,
  persistPageMetadata,
} from "@/lib/pages/persist-page-metadata.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/**
 * Inline-rename and change-icon state for a sidebar page row. Owns the editing
 * state and the lazy server-seed plumbing so {@link PageListItem} stays lean.
 */
export function usePageRowEditing({
  localPage,
  page,
  pages,
}: {
  localPage: LocalPage | null;
  page: PageSummary;
  pages: PageSummary[];
}) {
  const persistedTitle = localPage?.title ?? page.title;
  const persistedSlug = localPage?.slug ?? page.slug;

  const [isRenaming, setIsRenaming] = useState(false);
  const [title, setTitle] = useState(persistedTitle);
  const [prevPersistedTitle, setPrevPersistedTitle] = useState(persistedTitle);
  const [prevPersistedSlug, setPrevPersistedSlug] = useState(persistedSlug);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconPickerSeed, setIconPickerSeed] = useState<
    PageMetadataSeed | undefined
  >();
  const previousSlugRef = useRef(persistedSlug);
  const isRenamingRef = useRef(false);
  const seedRef = useRef<PageMetadataSeed | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  if (!isRenamingRef.current && persistedTitle !== prevPersistedTitle) {
    setPrevPersistedTitle(persistedTitle);
    setTitle(persistedTitle);
  }

  if (persistedSlug !== prevPersistedSlug) {
    setPrevPersistedSlug(persistedSlug);
    previousSlugRef.current = persistedSlug;
  }

  const ensureSeed = useCallback(async (): Promise<PageMetadataSeed | null> => {
    if (localPage) {
      return null;
    }

    if (seedRef.current) {
      return seedRef.current;
    }

    const loaded = await loadPage({ data: { slug: page.slug } });
    seedRef.current = {
      blocks: loaded.blocks,
      serverBaselineHash: hashPageBlocks(loaded.blocks),
    };
    return seedRef.current;
  }, [localPage, page.slug]);

  const handleTitleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle);

      if (nextTitle.trim() === "") {
        return;
      }

      const applyPersist = (seed?: PageMetadataSeed) => {
        persistPageMetadata({
          pageId: page.id,
          slug: previousSlugRef.current,
          previousSlug: previousSlugRef.current,
          title: nextTitle,
          pages,
          seed,
        });
      };

      if (localPage) {
        applyPersist();
        return;
      }

      ensureSeed()
        .then((seed) => {
          if (seed) {
            applyPersist(seed);
          }
        })
        .catch(() => undefined);
    },
    [ensureSeed, localPage, page.id, pages]
  );

  const startRenaming = useCallback(() => {
    isRenamingRef.current = true;
    setIsRenaming(true);
  }, []);

  const openChangeIcon = useCallback(() => {
    const openPicker = (seed?: PageMetadataSeed) => {
      if (seed) {
        setIconPickerSeed(seed);
      }
      setIconPickerOpen(true);
    };

    if (localPage) {
      openPicker();
      return;
    }

    ensureSeed()
      .then((seed) => {
        openPicker(seed ?? undefined);
      })
      .catch(() => openPicker());
  }, [ensureSeed, localPage]);

  useEffect(() => {
    if (!isRenaming) {
      return;
    }

    const input = renameInputRef.current;
    if (!input) {
      return;
    }

    requestAnimationFrame(() => {
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }, [isRenaming]);

  const stopRenaming = useCallback(() => {
    isRenamingRef.current = false;
    setIsRenaming(false);

    const resolvedTitle = title.trim() === "" ? DEFAULT_PAGE_TITLE : title;

    if (title.trim() === "") {
      setTitle(DEFAULT_PAGE_TITLE);
    }

    const applyPersist = (seed?: PageMetadataSeed) => {
      const { slug } = persistPageMetadata({
        pageId: page.id,
        previousSlug: previousSlugRef.current,
        title: resolvedTitle,
        pages,
        seed,
        syncUrl: true,
      });
      previousSlugRef.current = slug;
    };

    if (localPage) {
      applyPersist();
      return;
    }

    ensureSeed()
      .then((seed) => {
        if (seed) {
          applyPersist(seed);
        }
      })
      .catch(() => undefined);
  }, [ensureSeed, localPage, page.id, pages, title]);

  return {
    ensureSeed,
    handleTitleChange,
    iconPickerOpen,
    iconPickerSeed,
    isRenaming,
    openChangeIcon,
    previousSlugRef,
    renameInputRef,
    seedRef,
    setIconPickerOpen,
    startRenaming,
    stopRenaming,
    title,
  };
}
