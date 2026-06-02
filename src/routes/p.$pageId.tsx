import { createFileRoute, notFound } from "@tanstack/react-router";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useResolvedUserPageById } from "@/hooks/use-resolved-page.ts";
import {
  isLocallyDeletedPage,
  isUserCreatedPage,
} from "@/lib/schemas/local-page.ts";

export const Route = createFileRoute("/p/$pageId")({
  loader: () => ({ kind: "pending" as const }),
  component: UserPageByIdRoute,
});

function UserPageByIdRoute() {
  const { pageId } = Route.useParams();
  const isClient = useIsClient();

  if (!isClient) {
    return null;
  }

  return <UserPageByIdClient pageId={pageId} />;
}

function UserPageByIdClient({ pageId }: { pageId: string }) {
  const userPage = useResolvedUserPageById(pageId);

  if (
    !(userPage && isUserCreatedPage(userPage)) ||
    isLocallyDeletedPage(userPage)
  ) {
    throw notFound();
  }

  return (
    <SiteShell>
      <PageWorkspace kind="user" page={userPage} pageHasLocalDraft={true} />
    </SiteShell>
  );
}
