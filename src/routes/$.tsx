import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { DatabaseHubPage } from "@/components/database/database-hub-page.tsx";
import { useDatabaseSlugPath } from "@/components/database/database-slug-path-page.tsx";
import { DatabaseRowPage } from "@/components/database/row-page/database-row-page.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPagesSettling } from "@/hooks/use-local-pages.ts";
import { usePageListItems } from "@/hooks/use-page-list.ts";
import {
  useResolvedLocalPageBySlug,
  useResolvedUserPage,
} from "@/hooks/use-resolved-page.ts";
import { useSlugPageResolution } from "@/hooks/use-slug-page-resolution.ts";
import { useSyncPageUrl } from "@/hooks/use-sync-page-url.ts";
import {
  buildNoIndexMeta,
  buildPageLinks,
  buildPageMeta,
} from "@/lib/content/page-head.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import {
  hasAnyLocalDrafts,
  pageHasLocalDraft,
} from "@/lib/local-draft/dirty-pages-cookie.ts";
import { loadDirtyPageIds } from "@/lib/local-draft/load-dirty-page-ids.ts";
import { loadPageListLocalPreview } from "@/lib/pages/load-page-list-local-preview.ts";
import {
  pageNavTargetForUserPage,
  pagePathFromParam,
  pageSlugsEqual,
} from "@/lib/pages/slugify.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";
import { DatabaseTemplateEditorClient } from "@/routes/db.$databaseId_.template.tsx";

export const Route = createFileRoute("/$")({
  loader: async ({ context, params }) => {
    const slug = pagePathFromParam(params._splat ?? "");
    const dirtyPageIds = await loadDirtyPageIds();

    try {
      const page = await context.queryClient.ensureQueryData(
        pageBySlugQueryOptions(slug)
      );
      return {
        kind: "server" as const,
        page,
        pageHasLocalDraft: pageHasLocalDraft(page.id, dirtyPageIds),
      };
    } catch {
      // Unknown to the server catalog. Only cookie-flagged visitors may have
      // a matching local page; clean requests (crawlers) get a real 404
      // instead of an empty 200 shell.
      const localPagePreview = await loadPageListLocalPreview();
      const mayHaveLocalPage =
        hasAnyLocalDrafts(dirtyPageIds) || localPagePreview.length > 0;
      if (!mayHaveLocalPage) {
        throw notFound();
      }
      return { kind: "pending" as const, slug };
    }
  },
  head: ({ loaderData }) =>
    loaderData?.kind === "server"
      ? {
          meta: buildPageMeta(loaderData.page),
          links: buildPageLinks(loaderData.page),
        }
      : { meta: buildNoIndexMeta() },
  component: SplatPage,
});

function SplatPage() {
  const loaderData = Route.useLoaderData();

  if (loaderData.kind === "server") {
    return (
      <SiteShell>
        <PageWorkspace
          kind="server"
          page={loaderData.page}
          pageHasLocalDraft={loaderData.pageHasLocalDraft}
        />
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PendingSlugPage slug={loaderData.slug} />
    </SiteShell>
  );
}

function PendingSlugPage({ slug }: { slug: string }) {
  const isClient = useIsClient();

  if (!isClient) {
    return null;
  }

  return <PendingSlugPageClient slug={slug} />;
}

function renderDatabasePath(
  databasePath: ReturnType<typeof useDatabaseSlugPath>
) {
  if (databasePath?.kind === "hub") {
    return <DatabaseHubPage databaseId={databasePath.database.id} />;
  }
  if (databasePath?.kind === "row" && databasePath.row) {
    return (
      <DatabaseRowPage
        databaseId={databasePath.database.id}
        rowId={databasePath.row.id}
      />
    );
  }
  if (databasePath?.kind === "template") {
    return (
      <DatabaseTemplateEditorClient databaseId={databasePath.database.id} />
    );
  }
  return null;
}

function PendingSlugPageClient({ slug }: { slug: string }) {
  const localPageBySlug = useResolvedLocalPageBySlug(slug);
  const localPageResolved = useSlugPageResolution(slug, localPageBySlug);
  const localPage =
    localPageResolved && pageSlugsEqual(localPageResolved.slug, slug)
      ? localPageResolved
      : null;
  const userPageBySlug = useResolvedUserPage(slug);
  const isLocalPagesSettling = useLocalPagesSettling();
  const { pages: serverPages } = usePageListItems();
  const navigate = useNavigate();
  const databasePath = useDatabaseSlugPath(slug);

  useSyncPageUrl(
    localPage &&
      !isUserCreatedPage(localPage) &&
      !isLocallyDeletedPage(localPage)
      ? localPage.id
      : undefined,
    { urlSlug: slug }
  );

  useEffect(() => {
    const userPage =
      userPageBySlug ??
      (localPage &&
      isUserCreatedPage(localPage) &&
      !isLocallyDeletedPage(localPage)
        ? localPage
        : null);

    if (userPage) {
      navigate({ ...pageNavTargetForUserPage(userPage.slug), replace: true });
    }
  }, [localPage, navigate, userPageBySlug]);

  const serverSummary = useMemo(() => {
    if (
      !localPage ||
      isUserCreatedPage(localPage) ||
      isLocallyDeletedPage(localPage)
    ) {
      return null;
    }

    return serverPages.find((page) => page.id === localPage.id) ?? null;
  }, [localPage, serverPages]);

  const { data: shippedPage } = useQuery({
    ...pageBySlugQueryOptions(serverSummary?.slug ?? ""),
    enabled: serverSummary != null,
  });

  if (
    localPage &&
    isUserCreatedPage(localPage) &&
    !isLocallyDeletedPage(localPage)
  ) {
    return null;
  }

  if (
    localPage &&
    !isUserCreatedPage(localPage) &&
    !isLocallyDeletedPage(localPage) &&
    shippedPage
  ) {
    return (
      <PageWorkspace
        kind="server"
        page={{
          ...shippedPage,
          slug: localPage.slug,
          title: localPage.title,
          icon: localPage.icon ?? shippedPage.icon,
          parentId: localPage.parentId ?? shippedPage.parentId,
        }}
        pageHasLocalDraft={true}
      />
    );
  }

  if (localPage && !isUserCreatedPage(localPage) && !shippedPage) {
    return null;
  }

  if (!localPage) {
    const databasePage = renderDatabasePath(databasePath);
    if (databasePage) {
      return databasePage;
    }
    if (isLocalPagesSettling) {
      return null;
    }

    throw notFound();
  }

  return null;
}
