import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { buildPageMeta } from "@/lib/content/page-head.ts";
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
  head: ({ loaderData }) => ({
    meta: loaderData ? buildPageMeta(loaderData.page) : [],
  }),
  component: HomePage,
});

function HomePage() {
  const { page, pageHasLocalDraft: hasLocalDraft } = Route.useLoaderData();

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
