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
import {
  useIsCoarsePrimaryPointer,
  useIsNarrowViewport,
} from "@/components/layout/device-layout-provider.tsx";
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
import { SnapshotTitleDisplay } from "@/components/pages/snapshot-preview.tsx";
import { VersionPreviewProvider } from "@/components/pages/version-preview-context.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { usePageAccessLevel } from "@/hooks/use-page-access-level.ts";
import { usePageSettings } from "@/hooks/use-page-settings.ts";
import { useSyncPageUrl } from "@/hooks/use-sync-page-url.ts";
import type { TopLevelBlockAlign } from "@/lib/canvas/top-level-row-align.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { pageContentColumnClassName } from "@/lib/pages/page-content-layout.ts";
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
import { isReadOnlyAccessLevel } from "@/lib/schemas/page-access.ts";
import { cn } from "@/lib/utils.ts";

type PageWorkspaceProps = {
  pageHasLocalDraft: boolean;
  /**
   * Replaces {@link PageCanvas} while keeping the page shell (sidebar, header,
   * cover, footer). Used by database hub pages so the body is a full-page
   * `DatabaseTableView` with no block editor.
   */
  bodySlot?: ReactNode;
  /**
   * Replaces the header's page-tree breadcrumb — the row-template editor's page
   * is not in the sidebar tree, so it supplies a hub-based trail instead.
   */
  breadcrumbSlot?: ReactNode;
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
  /**
   * Left-edge anchor for top-level canvas blocks. Defaults to the page title
   * text; row pages whose `titleSlot` ends in a properties band pass
   * `"content-edge"` so blocks line up with those properties.
   */
  topLevelBlockAlign?: TopLevelBlockAlign;
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
      bodySlot={props.bodySlot}
      breadcrumbSlot={props.breadcrumbSlot}
      contentWrapper={props.contentWrapper}
      initialBlocks={initialBlocks}
      page={page}
      pageHasLocalDraft={pageHasLocalDraft}
      serverPage={serverPage}
      titleSeed={titleSeed}
      titleSlot={props.titleSlot}
      topLevelBlockAlign={props.topLevelBlockAlign}
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
  bodySlot,
  breadcrumbSlot,
  contentWrapper,
  initialBlocks,
  page,
  pageHasLocalDraft,
  serverPage,
  titleSeed,
  titleSlot,
  topLevelBlockAlign,
}: {
  bodySlot?: ReactNode;
  breadcrumbSlot?: ReactNode;
  contentWrapper?: (content: ReactNode) => ReactNode;
  initialBlocks: Page["blocks"];
  page: Page | LocalPage;
  pageHasLocalDraft: boolean;
  serverPage: Page | null;
  titleSeed: { blocks: Page["blocks"]; serverBaselineHash: string } | undefined;
  titleSlot?: ReactNode;
  topLevelBlockAlign?: TopLevelBlockAlign;
}) {
  const isNarrowViewport = useIsNarrowViewport();
  const isCoarsePrimaryPointer = useIsCoarsePrimaryPointer();
  // ReBAC: below `edit` the title renders read-only (the canvas gates itself —
  // see page-canvas.tsx). Live, so a mid-session level change re-resolves.
  const accessReadOnly = isReadOnlyAccessLevel(usePageAccessLevel(page.id));
  const { isCollapsed, isCollapsing } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed || isCollapsing);
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
      breadcrumbSlot={breadcrumbSlot}
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

  const coverSlot = headerImage ? (
    <PageCover
      className={
        isCoarsePrimaryPointer
          ? pageCoverTouchClassName
          : pageCoverMobileClassName
      }
      headerImage={headerImage}
      key={headerImage.src}
    />
  ) : null;

  const resolvedTitleSlot = resolveWorkspaceTitleSlot({
    accessReadOnly,
    bodySlot,
    page,
    pageHasLocalDraft,
    titleSeed,
    titleSlot,
  });

  const canvasContent = (
    <WorkspaceMainContent
      bodySlot={bodySlot}
      canvasNonce={canvasNonce}
      coverSlot={coverSlot}
      fullWidth={fullWidth}
      headerSlot={headerSlot}
      initialBlocks={initialBlocks}
      isCoarsePrimaryPointer={isCoarsePrimaryPointer}
      isNarrowViewport={isNarrowViewport}
      page={page}
      pageHasLocalDraft={pageHasLocalDraft}
      titleSlot={resolvedTitleSlot}
      topLevelBlockAlign={topLevelBlockAlign}
      typographyClassName={typographyClassName}
      typographyDataProps={typographyDataProps}
    />
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

/**
 * Canvas-free page body used by database hubs: same cover / header / title /
 * scroll chrome as {@link PageCanvas}, but the caller's `bodySlot` fills the
 * content column (typically a `fillHeight` database table view).
 */
function PageWorkspaceCustomBody({
  bodySlot,
  coverSlot,
  fullWidth,
  headerSlot,
  isCoarsePrimaryPointer,
  isNarrowViewport,
  titleSlot,
}: {
  bodySlot: ReactNode;
  coverSlot: ReactNode;
  fullWidth: boolean;
  headerSlot: ReactNode;
  isCoarsePrimaryPointer: boolean;
  isNarrowViewport: boolean;
  titleSlot: ReactNode;
}) {
  // Same insets as the canvas scroll tokens, but desktop uses overflow-hidden
  // so fillHeight tables get a bounded flex host (mobile keeps document scroll).
  const scrollInsetClassName = isCoarsePrimaryPointer
    ? "no-scrollbar pr-4 pb-[50vh] pl-3 md:px-12 md:pt-16 md:pb-12"
    : "no-scrollbar pr-4 pb-[50vh] pl-7 md:px-12 md:pt-16 md:pb-12";

  return (
    <div className="relative flex flex-col max-md:flex-none md:min-h-0 md:flex-1 md:overflow-hidden">
      <div
        className={cn(
          "relative flex flex-col max-md:overflow-x-clip md:min-h-0 md:flex-1 md:overflow-hidden md:overscroll-contain",
          scrollInsetClassName
        )}
        data-scroll-restoration-id="page-canvas-scroll"
        {...(fullWidth || isNarrowViewport
          ? { "data-page-full-width": "" }
          : {})}
      >
        {coverSlot}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col max-md:min-h-[90vh]">
          {headerSlot}
          <div
            className={cn(
              pageContentColumnClassName({ fullWidth, isNarrowViewport }),
              "flex min-h-0 flex-1 flex-col gap-4"
            )}
          >
            {titleSlot}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {bodySlot}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function resolveWorkspaceTitleSlot(options: {
  accessReadOnly: boolean;
  bodySlot?: ReactNode;
  page: Page | LocalPage;
  pageHasLocalDraft: boolean;
  titleSeed: { blocks: Page["blocks"]; serverBaselineHash: string } | undefined;
  titleSlot?: ReactNode;
}): ReactNode {
  if (options.titleSlot !== undefined) {
    return options.titleSlot;
  }
  if (options.bodySlot) {
    return null;
  }
  if (options.accessReadOnly) {
    return (
      <SnapshotTitleDisplay
        icon={options.page.icon}
        title={options.page.title}
      />
    );
  }
  return (
    <PageTitleEditor
      icon={options.page.icon}
      pageHasLocalDraft={options.pageHasLocalDraft}
      pageId={options.page.id}
      seed={options.titleSeed}
      slug={options.page.slug}
      title={options.page.title}
    />
  );
}

function WorkspaceMainContent({
  bodySlot,
  canvasNonce,
  coverSlot,
  fullWidth,
  headerSlot,
  initialBlocks,
  isCoarsePrimaryPointer,
  isNarrowViewport,
  page,
  pageHasLocalDraft,
  titleSlot,
  topLevelBlockAlign,
  typographyClassName,
  typographyDataProps,
}: {
  bodySlot?: ReactNode;
  canvasNonce: number;
  coverSlot: ReactNode;
  fullWidth: boolean;
  headerSlot: ReactNode;
  initialBlocks: Page["blocks"];
  isCoarsePrimaryPointer: boolean;
  isNarrowViewport: boolean;
  page: Page | LocalPage;
  pageHasLocalDraft: boolean;
  titleSlot: ReactNode;
  topLevelBlockAlign?: TopLevelBlockAlign;
  typographyClassName?: string;
  typographyDataProps: Record<string, unknown>;
}) {
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col max-md:flex-none",
        typographyClassName
      )}
      {...typographyDataProps}
    >
      {bodySlot ? (
        <PageWorkspaceCustomBody
          bodySlot={bodySlot}
          coverSlot={coverSlot}
          fullWidth={fullWidth}
          headerSlot={headerSlot}
          isCoarsePrimaryPointer={isCoarsePrimaryPointer}
          isNarrowViewport={isNarrowViewport}
          titleSlot={titleSlot}
        />
      ) : (
        <PageCanvas
          coverSlot={coverSlot}
          fullWidth={fullWidth}
          headerSlot={headerSlot}
          isNarrowViewport={isNarrowViewport}
          key={`${page.id}:${canvasNonce}`}
          pageHasLocalDraft={pageHasLocalDraft}
          serverPage={toServerPageSource(page, initialBlocks)}
          titleSlot={titleSlot}
          topLevelBlockAlign={topLevelBlockAlign}
        />
      )}
    </div>
  );
}
