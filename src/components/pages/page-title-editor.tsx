import { useCallback, useRef, useState } from "react";

import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import {
  useMergedPageListItems,
  usePageListItems,
} from "@/hooks/use-page-list.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { cn } from "@/lib/utils.ts";

interface PageTitleSeed {
  blocks: Block[];
  serverBaselineHash: string;
}

interface PageTitleEditorProps {
  pageHasLocalDraft: boolean;
  pageId: string;
  seed?: PageTitleSeed;
  slug: string;
  title: string;
}

interface PageTitleEditorViewProps extends PageTitleEditorProps {
  localPage: ReturnType<typeof useLocalPageById>;
  pages: ReturnType<typeof usePageListItems>["pages"];
}

function PageTitleEditorView({
  pageId,
  seed,
  title: defaultTitle,
  slug: defaultSlug,
  pages,
  localPage,
}: PageTitleEditorViewProps) {
  const persistedTitle = localPage?.title ?? defaultTitle;
  const persistedSlug = localPage?.slug ?? defaultSlug;

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

  const handleChange = useCallback(
    (nextTitle: string) => {
      setTitle(nextTitle);

      if (nextTitle.trim() === "") {
        return;
      }

      const { slug } = persistPageMetadata({
        pageId,
        previousSlug: previousSlugRef.current,
        title: nextTitle,
        seed: localPage ? undefined : seed,
        pages,
      });
      previousSlugRef.current = slug;
    },
    [localPage, pageId, pages, seed]
  );

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;

    if (title.trim() !== "") {
      return;
    }

    setTitle(DEFAULT_PAGE_TITLE);

    const { slug } = persistPageMetadata({
      pageId,
      previousSlug: previousSlugRef.current,
      title: DEFAULT_PAGE_TITLE,
      seed: localPage ? undefined : seed,
      pages,
    });
    previousSlugRef.current = slug;
  }, [localPage, pageId, pages, seed, title]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  return (
    <EditableSurface
      ariaLabel="Page title"
      className={cn(
        "h-auto",
        headingSurfaceClassName,
        headingTypographyClassNames[1]
      )}
      onChange={handleChange}
      onTextBlur={handleBlur}
      onTextFocus={handleFocus}
      placeholder={DEFAULT_PAGE_TITLE}
      value={title}
    />
  );
}

function PageTitleEditorLive(props: PageTitleEditorProps) {
  const { pages } = useMergedPageListItems();
  const localPage = useLocalPageById(props.pageId);

  return <PageTitleEditorView {...props} localPage={localPage} pages={pages} />;
}

export function PageTitleEditor(props: PageTitleEditorProps) {
  const isClient = useIsClient();
  const { pages } = usePageListItems();

  if (!isClient) {
    if (props.pageHasLocalDraft) {
      return null;
    }

    return (
      <PageTitleEditorView
        {...props}
        key={props.pageId}
        localPage={null}
        pages={pages}
      />
    );
  }

  return <PageTitleEditorLive key={props.pageId} {...props} />;
}
