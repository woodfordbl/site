import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DatabaseHubPageWorkspace } from "@/components/database/database-hub-page.tsx";
import {
  DatabaseSlugPathPage,
  useDatabaseSlugPath,
} from "@/components/database/database-slug-path-page.tsx";
import { DatabaseRowPageWorkspace } from "@/components/database/row-page/database-row-page.tsx";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPagesSettling } from "@/hooks/use-local-pages.ts";
import { useResolvedUserPage } from "@/hooks/use-resolved-page.ts";
import { useSlugPageResolution } from "@/hooks/use-slug-page-resolution.ts";
import { useSyncPageUrl } from "@/hooks/use-sync-page-url.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { useShippedDatabasesSettled } from "@/lib/databases/shipped-databases-settled.ts";
import {
  pageNavTargetForUserPage,
  pagePathFromParam,
  pageSlugsEqual,
} from "@/lib/pages/slugify.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";

export const Route = createFileRoute("/p/$")({
  loader: () => ({ kind: "pending" as const }),
  head: () => ({ meta: buildNoIndexMeta("Preview") }),
  component: UserPageBySlugRoute,
});

function UserPageBySlugRoute() {
  const { _splat } = Route.useParams();
  const isClient = useIsClient();

  if (!isClient) {
    // Keep the app shell during SSR so hydration swaps content, not layout.
    return <SiteShell>{null}</SiteShell>;
  }

  return <UserPageBySlugClient slug={pagePathFromParam(_splat ?? "")} />;
}

function UserPageBySlugClient({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const userPageBySlug = useResolvedUserPage(slug);
  const userPage = useSlugPageResolution(slug, userPageBySlug);
  const isLocalPagesSettling = useLocalPagesSettling();
  const databasePath = useDatabaseSlugPath(slug);
  const shippedDatabasesSettled = useShippedDatabasesSettled();

  const slugMatchesResolvedPage =
    userPage != null && pageSlugsEqual(userPage.slug, slug);
  // Id-fallback after rename: collection already has the next slug while the
  // router splat is still the previous one. Keep rendering; do not notFound.
  const isRenameSlugGap =
    userPage != null && userPageBySlug == null && !slugMatchesResolvedPage;
  const isValidUserPage =
    Boolean(userPage && isUserCreatedPage(userPage)) &&
    !(userPage && isLocallyDeletedPage(userPage)) &&
    (slugMatchesResolvedPage || isRenameSlugGap);

  // Prefer an exact database slug path over a stale slug→id fallback from a
  // previous `/p/$` navigation (see useSlugPageResolution).
  const useDatabasePath = Boolean(databasePath) && !isValidUserPage;

  useEffect(() => {
    if (!(isRenameSlugGap && userPage)) {
      return;
    }
    navigate({
      ...pageNavTargetForUserPage(userPage.slug),
      replace: true,
    });
  }, [isRenameSlugGap, navigate, slug, userPage]);

  // Skip replaceState sync during the rename gap — that leaves the router on
  // the stale splat. Router navigate above (and navigateAfter*) rematch instead.
  useSyncPageUrl(
    isValidUserPage && slugMatchesResolvedPage ? userPage?.id : undefined,
    {
      urlSlug: slug,
      userPage: true,
    }
  );

  if (!isValidUserPage) {
    if (isLocalPagesSettling) {
      return null;
    }

    if (useDatabasePath && databasePath) {
      return (
        <SiteShell>
          <DatabaseSlugPathPage splat={slug} />
        </SiteShell>
      );
    }

    // Shipped databases seed after boot; their hub/row slugs are unresolvable
    // until then, so a cold load must wait rather than 404.
    if (!shippedDatabasesSettled) {
      return null;
    }

    throw notFound();
  }

  // Hub/row marker pages are normal workspaces (+ properties rail for rows).
  if (userPage.databaseSource) {
    return (
      <SiteShell>
        <DatabaseHubPageWorkspace pageId={userPage.id} />
      </SiteShell>
    );
  }
  if (userPage.databaseRowSource) {
    return (
      <SiteShell>
        <DatabaseRowPageWorkspace pageId={userPage.id} />
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <PageWorkspace kind="user" page={userPage} pageHasLocalDraft={true} />
    </SiteShell>
  );
}
