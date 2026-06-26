import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { PageCanvas } from "@/components/canvas/page-canvas.tsx";
import { PageHeader } from "@/components/pages/page-header.tsx";
import { PageSidebar } from "@/components/pages/page-sidebar.tsx";
import {
  PageSidebarChromeProvider,
  usePageSidebarChrome,
} from "@/components/pages/page-sidebar-chrome.tsx";
import { PageSidebarRail } from "@/components/pages/page-sidebar-rail.tsx";
import { PageTitleEditor } from "@/components/pages/page-title-editor.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useIsNarrowViewport } from "@/hooks/device-layout.ts";
import { useActivePageRef } from "@/hooks/use-active-page-ref.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useSyncPageUrl } from "@/hooks/use-sync-page-url.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import { rememberSlugPageResolution } from "@/lib/pages/remember-slug-page-resolution.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";

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
  const [footerHost, setFooterHost] = useState<HTMLDivElement | null>(null);
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
        footerHost={footerHost}
        initialBlocks={initialBlocks}
        page={page}
        pageHasLocalDraft={pageHasLocalDraft}
        setFooterHost={setFooterHost}
        titleSeed={titleSeed}
      />
    </PageSidebarChromeProvider>
  );
}

function PageWorkspaceBody({
  footerHost,
  initialBlocks,
  page,
  pageHasLocalDraft,
  setFooterHost,
  titleSeed,
}: {
  footerHost: HTMLDivElement | null;
  initialBlocks: Page["blocks"];
  page: Page | LocalPage;
  pageHasLocalDraft: boolean;
  setFooterHost: (node: HTMLDivElement | null) => void;
  titleSeed: { blocks: Page["blocks"]; serverBaselineHash: string } | undefined;
}) {
  const isNarrowViewport = useIsNarrowViewport();
  const { isCollapsed } = usePageSidebarChrome();
  const showSidebarRail = !(isNarrowViewport || isCollapsed);

  const header = <PageHeader pageId={page.id} titleSeed={titleSeed} />;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible border border-border bg-background md:rounded-xl"
        data-page-main-panel=""
      >
        {showSidebarRail ? <PageSidebarRail /> : null}
        {/* Desktop: header is fixed above the scroll region. Mobile: it lives
            inside the scroll region (as headerSlot) so it scrolls away. */}
        {isNarrowViewport ? null : header}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PageCanvas
            footerHost={footerHost}
            headerSlot={
              isNarrowViewport ? (
                <div className="-mr-4 mb-4 -ml-8 md:hidden">{header}</div>
              ) : null
            }
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
      </div>
      <div
        className="pointer-events-none z-30 flex h-9 shrink-0 items-center justify-end px-2 md:px-0"
        ref={setFooterHost}
      />
    </div>
  );
}
