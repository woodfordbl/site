import { createFileRoute, notFound } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useLocalPagesSettling } from "@/hooks/use-local-pages.ts";
import { useResolvedUserPage } from "@/hooks/use-resolved-page.ts";
import { useSlugPageResolution } from "@/hooks/use-slug-page-resolution.ts";
import { useSyncPageUrl } from "@/hooks/use-sync-page-url.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { pagePathFromParam } from "@/lib/pages/slugify.ts";
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
  const userPageBySlug = useResolvedUserPage(slug);
  const userPage = useSlugPageResolution(slug, userPageBySlug);
  const isLocalPagesSettling = useLocalPagesSettling();

  useSyncPageUrl(userPage?.id, { urlSlug: slug, userPage: true });

  if (
    !(userPage && isUserCreatedPage(userPage)) ||
    isLocallyDeletedPage(userPage)
  ) {
    if (isLocalPagesSettling) {
      return null;
    }

    throw notFound();
  }

  return (
    <SiteShell>
      <PageWorkspace kind="user" page={userPage} pageHasLocalDraft={true} />
    </SiteShell>
  );
}
