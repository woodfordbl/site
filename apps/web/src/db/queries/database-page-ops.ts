import { createTransaction } from "@tanstack/react-db";

import {
  localDatabasesCollection,
  localPagesCollection,
} from "@/db/collections/local-collections.ts";
import { reportPersistenceError } from "@/db/persistence-errors.ts";
import { resolveDatabaseSlug } from "@/lib/databases/database-page-paths.ts";
import { replacePageSlugPrefix } from "@/lib/pages/build-page-tree.ts";
import { buildChildSlug, slugifyPageSegment } from "@/lib/pages/slugify.ts";

/**
 * Database ↔ page slug orchestration (rename cascades, hub subtree rewrites).
 * Definition CRUD stays in `database-collection-ops.ts`; path builders stay
 * pure in `database-page-paths.ts`.
 */

function nowIso(): string {
  return new Date().toISOString();
}

function createPagesAndDatabasesTransaction() {
  return createTransaction({
    autoCommit: false,
    mutationFn: async ({ transaction }) => {
      localDatabasesCollection.utils.acceptMutations(transaction);
      localPagesCollection.utils.acceptMutations(transaction);
      await Promise.resolve();
    },
  });
}

function findDatabaseHubPage(databaseId: string) {
  return localPagesCollection.toArray.find(
    (page) => page.databaseSource?.databaseId === databaseId
  );
}

function dedupeDatabaseSlug(
  databaseId: string,
  segment: string,
  hostParentId: string | null | undefined
): string {
  const hubParentIdByDatabaseId = new Map(
    localPagesCollection.toArray.flatMap((page) =>
      page.databaseSource
        ? [[page.databaseSource.databaseId, page.parentId] as const]
        : []
    )
  );
  const taken = new Set(
    localDatabasesCollection.toArray
      .filter(
        (database) =>
          database.id !== databaseId &&
          hubParentIdByDatabaseId.get(database.id) === hostParentId
      )
      .map(resolveDatabaseSlug)
  );
  if (!taken.has(segment)) {
    return segment;
  }

  let index = 2;
  while (taken.has(`${segment}-${index}`)) {
    index += 1;
  }
  return `${segment}-${index}`;
}

/** Hub slug rewrite produced by {@link renameDatabase} — feed to router navigate. */
export interface DatabaseRenameSlugChange {
  nextHubSlug: string;
  previousHubSlug: string;
}

/**
 * Live-sync a database's display name (and hub page title) without touching
 * route slugs. Use while typing; call {@link renameDatabase} on blur to commit
 * the slug cascade.
 */
export function setDatabaseName(databaseId: string, name: string): void {
  const database = localDatabasesCollection.get(databaseId);
  if (!database || database.name === name) {
    return;
  }

  const timestamp = nowIso();
  const hub = findDatabaseHubPage(databaseId);
  const tx = createPagesAndDatabasesTransaction();
  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.name = name;
      draft.updatedAt = timestamp;
    });
    if (hub) {
      localPagesCollection.update(hub.id, (draft) => {
        draft.title = name;
        draft.updatedAt = timestamp;
      });
    }
  });
  tx.commit().catch(reportPersistenceError);
}

/**
 * Rename a database, update its route segment, and cascade its hub subtree in
 * one transaction so observers never see a renamed DB with stale hub/row URLs.
 * Also mirrors the new name onto the hub page title when a hub exists.
 *
 * Returns the hub slug rewrite when the route segment changed — callers on the
 * open hub (or a row under it) must `navigate({ …, replace: true })` via
 * {@link resolveSlugPrefixRedirect}; `history.replaceState` alone leaves the
 * router on the stale splat and flashes not-found.
 */
export function renameDatabase(
  databaseId: string,
  name: string
): DatabaseRenameSlugChange | null {
  const database = localDatabasesCollection.get(databaseId);
  if (!database) {
    return null;
  }

  const timestamp = nowIso();
  const hub = findDatabaseHubPage(databaseId);
  const previousHubSlug = hub?.slug ?? null;
  const slug = dedupeDatabaseSlug(
    databaseId,
    slugifyPageSegment(name),
    hub?.parentId
  );
  const parent = hub?.parentId
    ? localPagesCollection.get(hub.parentId)
    : undefined;
  const nextHubSlug = hub ? buildChildSlug(parent?.slug ?? "/", slug) : null;

  const tx = createPagesAndDatabasesTransaction();
  tx.mutate(() => {
    localDatabasesCollection.update(databaseId, (draft) => {
      draft.name = name;
      draft.slug = slug;
      draft.updatedAt = timestamp;
    });

    if (!(hub && nextHubSlug)) {
      return;
    }

    const hubPrefix = hub.slug.endsWith("/") ? hub.slug : `${hub.slug}/`;

    for (const page of localPagesCollection.toArray) {
      if (page.id === hub.id || page.slug.startsWith(hubPrefix)) {
        localPagesCollection.update(page.id, (draft) => {
          draft.slug = replacePageSlugPrefix(hub.slug, nextHubSlug, draft.slug);
          if (page.id === hub.id) {
            draft.title = name;
          }
          draft.updatedAt = timestamp;
        });
      }
    }
  });

  tx.commit().catch(reportPersistenceError);

  if (!(previousHubSlug && nextHubSlug) || previousHubSlug === nextHubSlug) {
    return null;
  }

  return { previousHubSlug, nextHubSlug };
}

/**
 * Reparents a database hub under a new host page and cascades hub + row slug
 * prefixes so routes stay host-relative. Call after the host canvas blocks have
 * been rewritten (strip old hosts + append on the new host).
 */
export function reparentDatabaseHub(options: {
  databaseId: string;
  newHostPageId: string;
}): void {
  const { databaseId, newHostPageId } = options;
  const database = localDatabasesCollection.get(databaseId);
  const hub = findDatabaseHubPage(databaseId);
  if (!(database && hub)) {
    return;
  }

  const host = localPagesCollection.get(newHostPageId);
  if (!host) {
    return;
  }

  const timestamp = nowIso();
  const slug = dedupeDatabaseSlug(
    databaseId,
    resolveDatabaseSlug(database),
    newHostPageId
  );
  const nextHubSlug = buildChildSlug(host.slug, slug);
  const hubPrefix = hub.slug.endsWith("/") ? hub.slug : `${hub.slug}/`;
  const previousHubSlug = hub.slug;

  const tx = createPagesAndDatabasesTransaction();
  tx.mutate(() => {
    if (slug !== resolveDatabaseSlug(database)) {
      localDatabasesCollection.update(databaseId, (draft) => {
        draft.slug = slug;
        draft.updatedAt = timestamp;
      });
    }

    localPagesCollection.update(hub.id, (draft) => {
      draft.parentId = newHostPageId;
      draft.slug = nextHubSlug;
      draft.updatedAt = timestamp;
    });

    for (const page of localPagesCollection.toArray) {
      if (page.id === hub.id) {
        continue;
      }
      if (page.slug.startsWith(hubPrefix) || page.slug === previousHubSlug) {
        localPagesCollection.update(page.id, (draft) => {
          draft.slug = replacePageSlugPrefix(
            previousHubSlug,
            nextHubSlug,
            draft.slug
          );
          draft.updatedAt = timestamp;
        });
      }
    }
  });

  tx.commit().catch(reportPersistenceError);
}
