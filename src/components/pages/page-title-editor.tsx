import { useCallback, useRef, useState } from "react";

import { EditableSurface } from "@/components/editor/editable-surface.tsx";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";
import { persistPageMetadata } from "@/lib/pages/persist-page-metadata.ts";
import type { Block } from "@/lib/schemas/block.ts";
import { cn } from "@/lib/utils.ts";

interface PageTitleSeed {
  blocks: Block[];
  serverBaselineHash: string;
}

interface PageTitleEditorProps {
  icon?: string;
  pageHasLocalDraft: boolean;
  pageId: string;
  seed?: PageTitleSeed;
  slug: string;
  title: string;
}

interface PageTitleEditorViewProps extends PageTitleEditorProps {
  localPage: ReturnType<typeof useLocalPageById>;
  pages: PageSummary[];
}

function PageTitleEditorView({
  icon: defaultIcon,
  pageId,
  seed,
  title: defaultTitle,
  slug: defaultSlug,
  pages,
  localPage,
}: PageTitleEditorViewProps) {
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

  const handleChange = useCallback(
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

  const handleBlur = useCallback(() => {
    isEditingRef.current = false;

    const resolvedTitle = title.trim() === "" ? DEFAULT_PAGE_TITLE : title;

    if (title.trim() === "") {
      setTitle(DEFAULT_PAGE_TITLE);
    }

    const { slug } = persistPageMetadata({
      pageId,
      previousSlug: previousSlugRef.current,
      title: resolvedTitle,
      seed: localPage ? undefined : seed,
      pages,
      syncUrl: true,
    });
    previousSlugRef.current = slug;
  }, [localPage, pageId, pages, seed, title]);

  const handleFocus = useCallback(() => {
    isEditingRef.current = true;
  }, []);

  return (
    <div className="flex flex-row items-end">
      <PageIconPicker
        icon={persistedIcon}
        pageId={pageId}
        pages={pages}
        previousSlug={previousSlugRef.current}
        seed={localPage ? undefined : seed}
        title={title.trim() === "" ? DEFAULT_PAGE_TITLE : title}
      />
      <EditableSurface
        ariaLabel="Page title"
        className={cn(
          "w-full min-w-0",
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
    </div>
  );
}

function PageTitleEditorLive(props: PageTitleEditorProps) {
  const { pages } = useMergedPageListItems();
  const localPage = useLocalPageById(props.pageId);

  return <PageTitleEditorView {...props} localPage={localPage} pages={pages} />;
}

export function PageTitleEditor(props: PageTitleEditorProps) {
  return <PageTitleEditorLive key={props.pageId} {...props} />;
}
