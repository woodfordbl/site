import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import {
  useResolvedUserPage,
  useResolvedUserPageById,
} from "@/hooks/use-resolved-page.ts";
import { loadPage } from "@/lib/content/load-page.ts";
import { pageHasLocalDraft } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { loadDirtyPageIds } from "@/lib/local-draft/load-dirty-page-ids.ts";
import { pageNavTargetById, pagePathFromParam } from "@/lib/pages/slugify.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const slug = pagePathFromParam(params._splat ?? "");
    const dirtyPageIds = await loadDirtyPageIds();

    try {
      const page = await loadPage({ data: { slug } });
      return {
        kind: "server" as const,
        page,
        pageHasLocalDraft: pageHasLocalDraft(page.id, dirtyPageIds),
      };
    } catch {
      return { kind: "pending" as const, slug };
    }
  },
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
      <UserSlugPage slug={loaderData.slug} />
    </SiteShell>
  );
}

function UserSlugPage({ slug }: { slug: string }) {
  const isClient = useIsClient();

  if (!isClient) {
    return null;
  }

  return <UserSlugPageClient slug={slug} />;
}

function UserSlugPageClient({ slug }: { slug: string }) {
  const pageBySlug = useResolvedUserPage(slug);
  const stablePageIdRef = useRef<string | null>(null);
  const navigate = useNavigate();

  if (pageBySlug) {
    stablePageIdRef.current = pageBySlug.id;
  }

  const pageById = useResolvedUserPageById(stablePageIdRef.current);
  const userPage = pageById ?? pageBySlug;

  useEffect(() => {
    if (
      userPage &&
      isUserCreatedPage(userPage) &&
      !isLocallyDeletedPage(userPage)
    ) {
      navigate({ ...pageNavTargetById(userPage.id), replace: true });
    }
  }, [navigate, userPage]);

  if (
    userPage &&
    isUserCreatedPage(userPage) &&
    !isLocallyDeletedPage(userPage)
  ) {
    return null;
  }

  if (!userPage) {
    throw notFound();
  }

  return <PageWorkspace kind="user" page={userPage} pageHasLocalDraft={true} />;
}
