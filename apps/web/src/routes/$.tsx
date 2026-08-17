import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import {
  renderResolvedDatabasePath,
  useDatabaseSlugPath,
} from "@/components/database/database-slug-path-page.tsx";
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
import { databasePathExists } from "@/lib/content/load-database-path.ts";
import {
  buildNoIndexMeta,
  buildPageLinks,
  buildPageMeta,
} from "@/lib/content/page-head.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import { useShippedDatabasesSettled } from "@/lib/databases/shipped-databases-settled.ts";
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
import type { Page } from "@/lib/schemas/page.ts";

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
      if (mayHaveLocalPage) {
        return { kind: "pending" as const, slug };
      }
      // In the browser, hand the slug to the client resolver regardless: a
      // database's hub / row / template paths are built from data that only
      // exists in localStorage, and shipped databases seed there without ever
      // writing a draft cookie. Deciding here 404'd every one of those paths
      // for a visitor who had not yet edited anything — including the row
      // template editor, which is reachable no other way.
      // `PendingSlugPageClient` still throws `notFound()` once the local
      // collections have settled and nothing matches, so a genuinely missing
      // page is still a 404; only the server render answers early.
      if (typeof window !== "undefined") {
        return { kind: "pending" as const, slug };
      }
      // Server render of a clean request. Shipped content still fixes which
      // `{host}/{db}` prefixes belong to a database, so a deep link — typed,
      // reloaded, or followed from outside — gets the same client resolution
      // instead of a 404 the catalog was never able to rule on.
      if (await databasePathExists({ data: { slug } })) {
        return { kind: "pending" as const, slug };
      }
      throw notFound();
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
        <ServerSlugPage
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

function ServerSlugPage({
  page: loaderPage,
  pageHasLocalDraft,
}: {
  page: Page;
  pageHasLocalDraft: boolean;
}) {
  // Live RQ subscription so Save all can publish the persisted document before
  // local overlays clear — without awaiting a full router invalidate/SSR pass.
  // Home is the literal `"home"` key; splat routes use the leading-slash slug.
  const querySlug = loaderPage.slug === "/" ? "home" : loaderPage.slug;
  const { data: page = loaderPage } = useQuery({
    ...pageBySlugQueryOptions(querySlug),
    initialData: loaderPage,
  });

  return (
    <PageWorkspace
      kind="server"
      page={page}
      pageHasLocalDraft={pageHasLocalDraft}
    />
  );
}

function PendingSlugPage({ slug }: { slug: string }) {
  const isClient = useIsClient();

  if (!isClient) {
    return null;
  }

  return <PendingSlugPageClient slug={slug} />;
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
  const shippedDatabasesSettled = useShippedDatabasesSettled();

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
    if (databasePath) {
      return renderResolvedDatabasePath(databasePath);
    }
    if (isLocalPagesSettling) {
      return null;
    }
    // Shipped databases seed after boot; their hub/row slugs are unresolvable
    // until then, so a cold load must wait rather than 404.
    if (!shippedDatabasesSettled) {
      return null;
    }

    throw notFound();
  }

  return null;
}
