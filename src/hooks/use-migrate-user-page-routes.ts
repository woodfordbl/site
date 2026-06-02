import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { localPagesCollection } from "@/db/collections/local-collections.ts";
import { useLocalPages } from "@/hooks/use-local-pages.ts";
import { pageListQueryOptions } from "@/lib/content/page-list-query.ts";
import {
  findLegacyUserSlugRedirect,
  planUserPageSlugMigrations,
} from "@/lib/pages/migrate-user-page-routes.ts";
import { pageNavTargetById } from "@/lib/pages/slugify.ts";

const MIGRATION_FLAG_KEY = "site-user-page-routes-v1";

function snapshotAfterMigrations(
  serverPages: { id: string }[],
  localPages: { id: string; slug: string }[],
  migrations: Array<{ pageId: string; newSlug: string }>
): string {
  const slugById = new Map(
    migrations.map(
      (migration) => [migration.pageId, migration.newSlug] as const
    )
  );

  const localPart = localPages
    .map((page) => `${page.id}:${slugById.get(page.id) ?? page.slug}`)
    .join(",");

  return `${serverPages.map((page) => page.id).join(",")}:${localPart}`;
}

export function useMigrateUserPageRoutes(): void {
  const navigate = useNavigate();
  const { data: serverPages = [], isSuccess } = useQuery(pageListQueryOptions);
  const localPages = useLocalPages();
  const migratedSnapshotRef = useRef<string | null>(
    typeof window === "undefined"
      ? null
      : localStorage.getItem(MIGRATION_FLAG_KEY)
  );

  useEffect(() => {
    if (!isSuccess || serverPages.length === 0) {
      return;
    }

    if (typeof window === "undefined" || !localPagesCollection.isReady()) {
      return;
    }

    const snapshot = `${serverPages.map((page) => page.id).join(",")}:${localPages.map((page) => `${page.id}:${page.slug}`).join(",")}`;
    if (migratedSnapshotRef.current === snapshot) {
      return;
    }

    const migrations = planUserPageSlugMigrations(serverPages, localPages);
    const now = new Date().toISOString();

    for (const { pageId, newSlug } of migrations) {
      localPagesCollection.update(pageId, (draft) => {
        draft.slug = newSlug;
        draft.updatedAt = now;
      });
    }

    const legacyPageId = findLegacyUserSlugRedirect(
      window.location.pathname,
      localPages
    );
    if (legacyPageId) {
      navigate({ ...pageNavTargetById(legacyPageId), replace: true });
    }

    const nextSnapshot = snapshotAfterMigrations(
      serverPages,
      localPages,
      migrations
    );
    migratedSnapshotRef.current = nextSnapshot;
    localStorage.setItem(MIGRATION_FLAG_KEY, nextSnapshot);
  }, [isSuccess, localPages, navigate, serverPages]);
}
