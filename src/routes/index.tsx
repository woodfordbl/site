import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { buildPageLinks, buildPageMeta } from "@/lib/content/page-head.ts";
import { pageBySlugQueryOptions } from "@/lib/content/page-query.ts";
import { pageHasLocalDraft } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { loadDirtyPageIds } from "@/lib/local-draft/load-dirty-page-ids.ts";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const [page, dirtyPageIds] = await Promise.all([
      context.queryClient.ensureQueryData(pageBySlugQueryOptions("home")),
      loadDirtyPageIds(),
    ]);

    return {
      page,
      pageHasLocalDraft: pageHasLocalDraft(page.id, dirtyPageIds),
    };
  },
  head: ({ loaderData }) =>
    loaderData
      ? {
          meta: buildPageMeta(loaderData.page),
          links: buildPageLinks(loaderData.page),
        }
      : { meta: [] },
  component: HomePage,
});

function HomePage() {
  const { page: loaderPage, pageHasLocalDraft: hasLocalDraft } =
    Route.useLoaderData();
  // Subscribe so author Save all can `setQueryData` the just-written document
  // and the open canvas picks it up without awaiting `router.invalidate()`
  // (which SSR-revalidates and can hang on unrelated client-only trees).
  const { data: page = loaderPage } = useQuery({
    ...pageBySlugQueryOptions("home"),
    initialData: loaderPage,
  });

  return (
    <SiteShell>
      <PageWorkspace
        kind="server"
        page={page}
        pageHasLocalDraft={hasLocalDraft}
      />
    </SiteShell>
  );
}
