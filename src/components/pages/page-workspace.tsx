import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { PageCanvas } from "@/components/canvas/page-canvas.tsx";
import { NewPageButton } from "@/components/pages/new-page-button.tsx";
import { PageList } from "@/components/pages/page-list.tsx";
import { PageTitleEditor } from "@/components/pages/page-title-editor.tsx";
import type { ServerPageSource } from "@/db/queries/use-page-canvas.ts";
import { useLocalPageById } from "@/hooks/use-local-pages.ts";
import { useSyncPageUrlFromLocalMetadata } from "@/hooks/use-sync-page-url-from-local-metadata.ts";
import { hashPageBlocks } from "@/lib/content/block-hash.ts";
import {
  isLocallyDeletedPage,
  type LocalPage,
} from "@/lib/schemas/local-page.ts";
import type { Page } from "@/lib/schemas/page.ts";
import { Route as RootRoute } from "@/routes/__root.tsx";

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
    parentId: page.parentId ?? null,
    blocks,
  };
}

export function PageWorkspace(props: PageWorkspaceProps) {
  const { page, pageHasLocalDraft } = props;
  const { hasAnyLocalDrafts } = RootRoute.useRouteContext();
  const navigate = useNavigate();
  const localPage = useLocalPageById(page.id);
  useSyncPageUrlFromLocalMetadata(page.id);

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

  const serverPage = props.kind === "server" ? props.page : null;
  const titleSeed = serverPage
    ? {
        blocks: serverPage.blocks,
        serverBaselineHash: hashPageBlocks(serverPage.blocks),
      }
    : undefined;
  const initialBlocks = serverPage?.blocks ?? [];

  return (
    <div className="flex gap-12">
      <aside className="hidden w-48 shrink-0 lg:block">
        <PageList hasAnyLocalDrafts={hasAnyLocalDrafts} />
        <NewPageButton />
      </aside>
      <div className="min-w-0 flex-1">
        <PageTitleEditor
          pageHasLocalDraft={pageHasLocalDraft}
          pageId={page.id}
          seed={titleSeed}
          slug={page.slug}
          title={page.title}
        />
        <PageCanvas
          pageHasLocalDraft={pageHasLocalDraft}
          serverPage={toServerPageSource(page, initialBlocks)}
        />
      </div>
    </div>
  );
}
