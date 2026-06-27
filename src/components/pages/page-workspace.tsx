import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageCanvas } from "@/components/canvas/page-canvas.tsx";
import { PageCanvasFooter } from "@/components/canvas/page-canvas-footer.tsx";
import { PageHeader } from "@/components/pages/page-header.tsx";
import { PageSidebar } from "@/components/pages/page-sidebar.tsx";
import {
  PageSidebarChromeProvider,
  usePageSidebarChrome,
} from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { PageTitleEditor } from "@/components/pages/page-title-editor.tsx";
import { PageVersionPreview } from "@/components/pages/page-version-preview.tsx";
import { VersionPreviewProvider } from "@/components/pages/version-preview-context.tsx";
import { SiteSettingsTrigger } from "@/components/settings/site-settings-trigger.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import {
  useIsCoarsePrimaryPointer,
  useIsNarrowViewport,
} from "@/hooks/device-layout.ts";
import { useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import { useSyncPageUrl } from "@/hooks/use-sync-page-url.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { pageContentTypographyProps } from "@/lib/pages/page-content-typography.ts";
import type { PageSnapshotDescriptor } from "@/lib/pages/page-snapshot-types.ts";
import {
  pageCanvasMobileHeaderSlotClassName,
  pageCanvasTouchHeaderSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import { rememberSlugPageResolution } from "@/lib/pages/remember-slug-page-resolution.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";
import { cn } from "@/lib/utils.ts";

type PageWorkspaceProps = {
  pageHasLocalDraft: boolean;
} & (
  | {
      kind: "server";
      page: Page;
    }
  | {
      kind: "user";
      page: LocalPage;
    }
);

function toServerPageSource(
  page: Page | LocalPage,
  blocks: ServerPageSource["blocks"]
): ServerPageSource {
  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    icon: page.icon,
    parentId: page.parentId ?? null,
    blocks,
  };
}

export function PageWorkspace(props: PageWorkspaceProps) {
  const { page, pageHasLocalDraft } = props;
  const navigate = useNavigate();
  const activePageRef = useActivePageRef();
  const localPage = useLocalPageById(page.id);
  useSyncPageUrl(page.id);

  const serverPage = props.kind === "server" ? props.page : null;
  const titleSeed = useMemo(
    () =>
      serverPage
        ? {
            blocks: serverPage.blocks,
            serverBaselineHash: hashPageBlocks(serverPage.blocks),
          }
        : undefined,
    [serverPage]
  );

  useEffect(() => {
    if (activePageRef.slug) {
      rememberSlugPageResolution(activePageRef.slug, page.id);
    }
  }, [activePageRef.slug, page.id]);

  useEffect(() => {
    if (
      props.kind === "server" &&
      localPage &&
      isLocallyDeletedPage(localPage)
    ) {
      navigate({ replace: true, to: "/" });
    }
  }, [localPage, navigate, props.kind]);

  if (props.kind === "server" && localPage && isLocallyDeletedPage(localPage)) {
    return null;
  }

  const initialBlocks = serverPage?.blocks ?? [];

  return (
    <PageSidebarChromeProvider sidebar={<PageSidebar />}>
      <PageWorkspaceBody
        initialBlocks={initialBlocks}
        page={page}
        pageHasLocalDraft={pageHasLocalDraft}
        serverPage={serverPage}
        titleSeed={titleSeed}
      />
    </PageSidebarChromeProvider>
  );
}

function PageWorkspaceBody({
  initialBlocks,
  page,
  pageHasLocalDraft,
  serverPage,
  titleSeed,
}: {
  initialBlocks: Page["blocks"];
  page: Page | LocalPage;
  pageHasLocalDraft: boolean;
  serverPage: Page | null;
  titleSeed: { blocks: Page["blocks"]; serverBaselineHash: string } | undefined;
}) {
  const isNarrowViewport = useIsNarrowViewport();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);
  const { font, fullWidth, smallText } = usePageSettings({
    pageId: page.id,
    seed: titleSeed,
    serverPage,
  });
  const typographyProps = pageContentTypographyProps({ font, smallText });
  const { className: typographyClassName, ...typographyDataProps } =
    typographyProps;
  // Bumped after a reset/refresh/save-all clears local state for the open page
  // so the canvas remounts and re-reads fresh (shipped) data.
  const [canvasNonce, setCanvasNonce] = useState(0);
  const bumpCanvasNonce = useCallback(() => {
    setCanvasNonce((nonce) => nonce + 1);
  }, []);

  // When set, the page is taken over by a read-only version preview.
  const [previewDescriptor, setPreviewDescriptor] =
    useState<PageSnapshotDescriptor | null>(null);
  const enterPreview = useCallback((descriptor: PageSnapshotDescriptor) => {
    setPreviewDescriptor(descriptor);
  }, []);
  const exitPreview = useCallback(() => setPreviewDescriptor(null), []);
  const handleRestored = useCallback(() => {
    bumpCanvasNonce();
    setPreviewDescriptor(null);
  }, [bumpCanvasNonce]);

  const header = (
    <PageHeader
      onAfterReset={bumpCanvasNonce}
      pageId={page.id}
      seed={titleSeed}
      serverPage={serverPage}
    />
  );

  const canvasContent = (
    <div
      className={cn("min-h-0 min-w-0 flex-1", typographyClassName)}
      {...typographyDataProps}
    >
      <PageCanvas
        fullWidth={fullWidth}
        headerSlot={
          isNarrowViewport ? (
            <div
              className={
                isCoarsePrimaryPointer
                  ? pageCanvasTouchHeaderSlotClassName
                  : pageCanvasMobileHeaderSlotClassName
              }
            >
              {header}
            </div>
          ) : null
        }
        isNarrowViewport={isNarrowViewport}
        key={`${page.id}:${canvasNonce}`}
        pageHasLocalDraft={pageHasLocalDraft}
        serverPage={toServerPageSource(page, initialBlocks)}
        titleSlot={
          <PageTitleEditor
            icon={page.icon}
            pageHasLocalDraft={pageHasLocalDraft}
            pageId={page.id}
            seed={titleSeed}
            slug={page.slug}
            title={page.title}
          />
        }
      />
    </div>
  );

  return (
    <VersionPreviewProvider value={{ enterPreview }}>
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible border border-border bg-background max-md:border-0 md:rounded-xl"
          data-page-main-panel=""
        >
          {previewDescriptor ? (
            <PageVersionPreview
              descriptor={previewDescriptor}
              onExit={exitPreview}
              onRestored={handleRestored}
              pageId={page.id}
            />
          ) : (
            <>
              {showSidebarRail ? <PageSidebarRail /> : null}
              {/* Desktop: header is fixed above the scroll region. Mobile: it
                  lives inside the scroll region (as headerSlot) so it scrolls. */}
              {isNarrowViewport ? null : header}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {canvasContent}
              </div>
            </>
          )}
        </div>
        <div className="pointer-events-none z-30 flex h-9 shrink-0 items-center justify-end gap-1 px-2 max-md:hidden md:px-0">
          <PageCanvasFooter onAfterReset={bumpCanvasNonce} pageId={page.id} />
          <SiteSettingsTrigger pageId={page.id} />
        </div>
      </div>
    </VersionPreviewProvider>
  );
}
