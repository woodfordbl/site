import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { TemplateEditorSidebar } from "@/components/pages/template-editor-sidebar.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import {
  useLocalPageById,
  useLocalPagesSettling,
} from "@/hooks/use-local-pages.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import { readTemplateLocalPage } from "@/lib/pages/template-store.ts";

export const Route = createFileRoute("/template")({
  loader: () => ({ kind: "pending" as const }),
  head: () => ({ meta: buildNoIndexMeta("Template") }),
  component: TemplateEditorRoute,
});

function TemplateEditorRoute() {
  const isClient = useIsClient();

  if (!isClient) {
    // Keep the app shell during SSR so hydration swaps content, not layout.
    return <SiteShell>{null}</SiteShell>;
  }

  return <TemplateEditorClient />;
}

function TemplateEditorClient() {
  const navigate = useNavigate();
  const templatePageFromList = useLocalPageById(TEMPLATE_PAGE_ID);
  const templatePage = templatePageFromList ?? readTemplateLocalPage();
  const isSettling = useLocalPagesSettling();

  useEffect(() => {
    if (!(templatePage || isSettling)) {
      navigate({
        params: { section: "template" },
        replace: true,
        to: "/settings/$section",
      });
    }
  }, [isSettling, navigate, templatePage]);

  if (!templatePage) {
    return <SiteShell>{null}</SiteShell>;
  }

  return (
    <SiteShell>
      <PageWorkspace
        kind="user"
        page={templatePage}
        pageHasLocalDraft={true}
        sidebar={<TemplateEditorSidebar />}
      />
    </SiteShell>
  );
}
