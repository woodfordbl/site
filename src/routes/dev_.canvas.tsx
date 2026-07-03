import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import { SiteShell } from "@/components/layout/site-shell.tsx";
import { PageWorkspace } from "@/components/pages/page-workspace.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import {
  useLocalPageById,
  useLocalPagesSettling,
} from "@/hooks/use-local-pages.ts";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";
import { CANVAS_FIXTURE_PAGE_ID } from "@/lib/pages/canvas-fixture-page.ts";
import {
  canvasFixtureExists,
  seedCanvasFixturePage,
} from "@/lib/pages/canvas-fixture-store.ts";

export const Route = createFileRoute("/dev_/canvas")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  head: () => ({ meta: buildNoIndexMeta() }),
  component: CanvasFixtureRoute,
});

/**
 * Dev-only playground: a reserved page seeded with every container permutation
 * so pointer features (marquee drill, overclick, DnD) can be exercised — and
 * scripted against — without hand-building content. Edits persist locally like
 * any page; the reset button reseeds the canonical fixture.
 */
function CanvasFixtureRoute() {
  const isClient = useIsClient();

  if (!isClient) {
    // Keep the app shell during SSR so hydration swaps content, not layout.
    return <SiteShell>{null}</SiteShell>;
  }

  return <CanvasFixtureClient />;
}

function FixtureSidebar() {
  return (
    <div className="flex flex-col gap-2 p-4 text-sm">
      <p className="font-medium">Canvas fixture</p>
      <p className="text-muted-foreground">
        Dev-only playground with every container permutation. Edits persist
        locally.
      </p>
      <button
        className="w-fit rounded-md border px-2 py-1 text-xs hover:bg-muted"
        onClick={() => seedCanvasFixturePage()}
        type="button"
      >
        Reset fixture content
      </button>
    </div>
  );
}

function CanvasFixtureClient() {
  const fixturePage = useLocalPageById(CANVAS_FIXTURE_PAGE_ID);
  const isSettling = useLocalPagesSettling();

  useEffect(() => {
    if (!(isSettling || canvasFixtureExists())) {
      seedCanvasFixturePage();
    }
  }, [isSettling]);

  if (!fixturePage) {
    return <SiteShell>{null}</SiteShell>;
  }

  return (
    <SiteShell>
      <PageWorkspace
        kind="user"
        page={fixturePage}
        pageHasLocalDraft={true}
        sidebar={<FixtureSidebar />}
      />
    </SiteShell>
  );
}
