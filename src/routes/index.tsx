import { createFileRoute } from "@tanstack/react-router";
import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { loadPage } from "@/lib/content/load-page.ts";
import { pageHasLocalDraft } from "@/lib/local-draft/dirty-pages-cookie.ts";
import { loadDirtyPageIds } from "@/lib/local-draft/load-dirty-page-ids.ts";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [page, dirtyPageIds] = await Promise.all([
      loadPage({ data: { slug: "home" } }),
      loadDirtyPageIds(),
    ]);

    return {
      page,
      pageHasLocalDraft: pageHasLocalDraft(page.id, dirtyPageIds),
    };
  },
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
