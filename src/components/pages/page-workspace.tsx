import { useNavigate } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { PageCanvas } from "@/components/canvas/page-canvas.tsx";
import { PageCommandHotkeys } from "@/components/keyboard/page-command-hotkeys.tsx";
import { PageCover } from "@/components/pages/page-cover.tsx";
import { PageCoverProvider } from "@/components/pages/page-cover-context.tsx";
import { PageHeader } from "@/components/pages/page-header.tsx";
import { PageInsetFooter } from "@/components/pages/page-inset-footer.tsx";
import { PageSidebar } from "@/components/pages/page-sidebar.tsx";
import {
  PageSidebarChromeProvider,
  useOptionalPageSidebarChrome,
  usePageSidebarChrome,
} from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { PageStaleBanner } from "@/components/pages/page-stale-banner.tsx";
import { PageTitleEditor } from "@/components/pages/page-title-editor.tsx";
import { PageVersionPreview } from "@/components/pages/page-version-preview.tsx";
import { ServerVersionPreview } from "@/components/pages/server-version-preview.tsx";
import { VersionPreviewProvider } from "@/components/pages/version-preview-context.tsx";
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
  pageCanvasMobileHeaderSlotStickyClassName,
  pageCanvasTouchHeaderSlotClassName,
  pageCanvasTouchHeaderSlotStickyClassName,
  pageCoverDesktopHeaderSlotClassName,
  pageCoverMobileClassName,
  pageCoverTouchClassName,
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
  /**
   * Wraps the canvas scroll region only — e.g. the row-template editor's
   * properties rail splits content + side panel while the page header stays
   * full width above the split.
   */
  contentWrapper?: (canvasRegion: ReactNode) => ReactNode;
  /** Overrides the default page sidebar (e.g. the template editor's chrome). */
  sidebar?: ReactNode;
  /**
   * Overrides the default editable title (`PageTitleEditor`) — e.g. the
   * row-template editor's locked title + properties header.
   */
  titleSlot?: ReactNode;
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

/**
 * Picks the mobile header slot class. With a cover present the bar is sticky +
 * frosted (so the cover scrolls up and reads as glass behind it); without one it
 * keeps the legacy scroll-away behavior.
 */
function resolveHeaderSlotClassName(
  isCoarsePrimaryPointer: boolean,
  hasCover: boolean
): string {
  if (isCoarsePrimaryPointer) {
    return hasCover
      ? pageCanvasTouchHeaderSlotStickyClassName
      : pageCanvasTouchHeaderSlotClassName;
  }
  return hasCover
    ? pageCanvasMobileHeaderSlotStickyClassName
    : pageCanvasMobileHeaderSlotClassName;
}

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
    sidebarOrder: page.sidebarOrder,
    blocks,
  };
}

export function PageWorkspace(props: PageWorkspaceProps) {
  const { page, pageHasLocalDraft } = props;
  const navigate = useNavigate();
  const activePageRef = useActivePageRef();
  const localPage = useLocalPageById(page.id);
  const existingChrome = useOptionalPageSidebarChrome();
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

  const body = (
    <PageWorkspaceBody
      contentWrapper={props.contentWrapper}
      initialBlocks={initialBlocks}
      page={page}
      pageHasLocalDraft={pageHasLocalDraft}
      serverPage={serverPage}
      titleSeed={titleSeed}
      titleSlot={props.titleSlot}
    />
  );

  // A caller that already owns a sidebar shell (e.g. the row-template editor
  // swapping between edit and preview) keeps it mounted; nesting a second
  // provider would remount the sidebar — and drop its pin state — per swap.
  if (existingChrome) {
    return body;
  }

  return (
    <PageSidebarChromeProvider sidebar={props.sidebar ?? <PageSidebar />}>
      {body}
    </PageSidebarChromeProvider>
  );
}

function PageWorkspaceBody({
  contentWrapper,
  initialBlocks,
  page,
  pageHasLocalDraft,
  serverPage,
  titleSeed,
  titleSlot,
}: {
  contentWrapper?: (content: ReactNode) => ReactNode;
  initialBlocks: Page["blocks"];
  page: Page | LocalPage;
  pageHasLocalDraft: boolean;
  serverPage: Page | null;
  titleSeed: { blocks: Page["blocks"]; serverBaselineHash: string } | undefined;
  titleSlot?: ReactNode;
}) {
  const isNarrowViewport = useIsNarrowViewport();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);
  const { font, fullWidth, headerImage, setHeaderImage, textScale } =
    usePageSettings({
      pageId: page.id,
      seed: titleSeed,
      serverPage,
    });
  const typographyProps = pageContentTypographyProps({ font, textScale });
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

  // When true, the page is taken over by a read-only render of the current
  // shipped (site) version — the stale-conflict counterpart to the snapshot
  // preview above.
  const [serverPreviewOpen, setServerPreviewOpen] = useState(false);
  const openServerPreview = useCallback(() => {
    setServerPreviewOpen(true);
  }, []);
  const exitServerPreview = useCallback(() => {
    setServerPreviewOpen(false);
  }, []);
  const handleServerPreviewReset = useCallback(() => {
    setServerPreviewOpen(false);
    bumpCanvasNonce();
  }, [bumpCanvasNonce]);

  const header = (
    <PageHeader
      onAfterReset={bumpCanvasNonce}
      pageId={page.id}
      seed={titleSeed}
      serverPage={serverPage}
    />
  );

  // Mobile always renders the header inside the scroll region. Desktop does too
  // *when a cover is present* — overlaid on the cover's base and pinned on
  // scroll; otherwise it stays a fixed bar above the scroll region (below).
  const hasCover = Boolean(headerImage);
  const headerSlot =
    isNarrowViewport || hasCover ? (
      <div
        className={
          isNarrowViewport
            ? resolveHeaderSlotClassName(isCoarsePrimaryPointer, hasCover)
            : pageCoverDesktopHeaderSlotClassName
        }
      >
        {header}
      </div>
    ) : null;

  const canvasContent = (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none",
        typographyClassName
      )}
      {...typographyDataProps}
    >
      <PageCanvas
        coverSlot={
          headerImage ? (
            <PageCover
              className={
                isCoarsePrimaryPointer
                  ? pageCoverTouchClassName
                  : pageCoverMobileClassName
              }
              headerImage={headerImage}
              key={headerImage.src}
            />
          ) : null
        }
        fullWidth={fullWidth}
        headerSlot={headerSlot}
        isNarrowViewport={isNarrowViewport}
        key={`${page.id}:${canvasNonce}`}
        pageHasLocalDraft={pageHasLocalDraft}
        serverPage={toServerPageSource(page, initialBlocks)}
        titleSlot={
          titleSlot ?? (
            <PageTitleEditor
              icon={page.icon}
              pageHasLocalDraft={pageHasLocalDraft}
              pageId={page.id}
              seed={titleSeed}
              slug={page.slug}
              title={page.title}
            />
          )
        }
      />
    </div>
  );

  const canvasRegion = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none max-md:overflow-visible md:overflow-hidden">
      {canvasContent}
    </div>
  );

  const workspaceMain = (
    <>
      {/* Desktop with no cover: header is a fixed bar above the scroll
        region. Mobile, or desktop with a cover: it lives inside the scroll
        region (as headerSlot). */}
      {isNarrowViewport || hasCover ? null : header}
      {serverPage ? (
        <PageStaleBanner
          onAfterReset={bumpCanvasNonce}
          onPreview={openServerPreview}
          serverPage={serverPage}
        />
      ) : null}
      {contentWrapper?.(canvasRegion) ?? canvasRegion}
    </>
  );

  return (
    <PageCoverProvider
      headerImage={headerImage}
      setHeaderImage={setHeaderImage}
    >
      <VersionPreviewProvider value={{ enterPreview }}>
        <PageCommandHotkeys
          pageId={page.id}
          seed={titleSeed}
          serverPage={serverPage}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:h-auto md:h-full">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none">
            {showSidebarRail ? <PageSidebarRail /> : null}
            <div
              className="relative flex min-h-0 min-w-0 flex-1 flex-col border border-border bg-background max-md:flex-none max-md:overflow-visible max-md:border-0 md:overflow-hidden md:rounded-xl"
              data-page-main-panel=""
            >
              {previewDescriptor ? (
                <PageVersionPreview
                  descriptor={previewDescriptor}
                  onExit={exitPreview}
                  onRestored={handleRestored}
                  pageId={page.id}
                />
              ) : null}
              {!previewDescriptor && serverPreviewOpen && serverPage ? (
                <ServerVersionPreview
                  onExit={exitServerPreview}
                  onReset={handleServerPreviewReset}
                  serverPage={serverPage}
                />
              ) : null}
              {previewDescriptor || (serverPreviewOpen && serverPage)
                ? null
                : workspaceMain}
            </div>
          </div>
          <PageInsetFooter onAfterReset={bumpCanvasNonce} pageId={page.id} />
        </div>
      </VersionPreviewProvider>
    </PageCoverProvider>
  );
}
