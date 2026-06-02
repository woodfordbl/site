# Local-first persistence

## Two storage paths

| Path | Collection / file | Survives deploy |
|------|-------------------|-----------------|
| Server defaults | `content/pages/**/*.json` | Yes (git) |
| Local page metadata | `localPagesCollection` (`site-local-pages`) | No (localStorage) |
| Local blocks | `localBlocksCollection` (`site-local-blocks:<pageId>` shards) | No (localStorage) |

## Local page document (metadata)

One metadata record per `page.id` in `localPagesCollection`:

- `id`, `slug`, `title`, `parentId`
- `blockOrder` — flat block ids in document order (updated on structural edits)
- `serverBaselineHash` — `hashPageBlocks(server.blocks)` at seed time; `null` for user-created pages
- `deletedAt` — when set, the page is hidden locally (shipped JSON unchanged)
- `createdAt` — ISO timestamp set once at insert (lazy-seed uses first local edit time; never updated)
- `updatedAt`

Block content lives in `localBlocksCollection` (one row per block, keyed by `block.id`, with `pageId` and `updatedAt`).

## Local block rows

Each edited block is stored separately:

- All fields from the canvas `Block` schema
- `pageId` — owning page
- `updatedAt` — ISO timestamp for cross-tab last-write-wins merge

Physical storage uses **per-page shards** (`site-local-blocks:<pageId>`) so typing on one page only re-serializes that page’s blocks, not the whole site.

## Lazy seed

Server pages are not copied to localStorage until the first edit. User-created pages are inserted on `page.create` with one empty `text` block in the blocks collection.

**Canvas invariants:** `usePageCanvas` applies `normalizeEditablePageBlocks` so every page has at least one block and at least one trailing empty top-level `text` row when the last stored row is not already blank. Blank rows use normal block ids and are persisted through the same full-order write path as other structural edits.

## Reads

Route loader supplies server JSON for SSR and baseline. Client renders blocks from `localBlocksCollection` when any exist for the page, otherwise server blocks. Page metadata (title, slug, `blockOrder`) comes from `localPagesCollection` when present. `usePageBlocks` applies `blockOrder` to the page's local block rows before the canvas builds rows, so localStorage key order is never treated as document order. The sidebar merges shipped pages with local metadata via `mergePageList`, which sets `routeBy: "id"` for user-created pages and `routeBy: "slug"` for shipped/lazy-seed rows. User pages resolve at `/p/$pageId`; shipped pages use slug routes. The root route prefetches the page list into React Query.

## SSR dirty cookie

localStorage is unavailable during SSR, so a lightweight cookie (`site-local-dirty`) mirrors which pages have local draft data. The cookie stores comma-separated page ids; localStorage remains the source of truth on the client.

| Event | Cookie |
|-------|--------|
| First local edit (metadata or blocks) | `markPageDirty(pageId)` |
| Reset to server, page delete, save to source | `markPageClean(pageId)` |
| Client boot | `reconcileDirtyPagesCookie()` syncs cookie from `site-local-pages` + block shard keys |

Route loaders read the cookie on the server (`getDirtyPageIds` server fn) and skip SSR for workspace UI that would flash on hydrate:

- **`pageHasLocalDraft`** (current page id in cookie) → skip canvas + title SSR
- **`hasAnyLocalDrafts`** (cookie non-empty) → skip sidebar merged list SSR

Clean first visit still SSRs shipped content. Dirty revisit renders a blank shell until hydrate, then the live local-first UI.

Implementation: `src/lib/local-draft/dirty-pages-cookie.ts`.

## Writes

- **Text / single-block edits:** `localBlocksCollection.update` for that block immediately (no 300ms debounce).
- **Structural edits** (insert, move, delete, paste): transactional `replacePageBlocks` for the page.
- **Page metadata:** `persistPageMetadata` and `page.create` update `localPagesCollection` only.
- **Cross-tab sync:** TanStack DB `storage` events on page metadata and block shard keys; the canvas reads blocks from `useLiveQuery` (`usePageBlocks`) and overlays a focused-row draft while typing so another tab cannot overwrite the active field. The focused draft is scoped to the active block id and clears when focus moves. When metadata sync changes a page slug, `PageWorkspace` runs `useSyncPageUrlFromLocalMetadata` so passive tabs update the address bar via `history.replaceState` — **skipped for user-created pages** (`isUserCreatedPage`), which keep a stable `/p/$pageId` URL. Shipped/lazy-seed renames use the same helper and `persistPageMetadata` → `syncPageUrl` path.

`replacePageBlocks` is the durable-order boundary for canvas structure. It must update `localPagesCollection.blockOrder` and the page's `localBlocksCollection` rows in the same TanStack DB transaction, and that transaction must accept mutations for both collections. If the block rows are accepted without the page metadata mutation, later reads can combine new rows with stale `blockOrder` and render inserts or moves out of order.

## Row tree

`buildBlockTree(blocks)` produces top-level rows + nested container children by `parentId`, sorted by `blockOrder` within each scope. `CanvasRow.sortOrder` is derived at tree build time for UI only; it is not stored on block rows.

`mergeBlocksOnSync` exists for cross-tab LWW tests but is not wired into the live read path. Production typing uses `usePageBlocks` plus a focused-row draft overlay in `usePageCanvas` so another tab cannot overwrite the active field.

## Ordering invariant

The canvas follows an editor-state ordering model: UI commands resolve a placement against the current row tree, mutate the flat block array, and persist the resulting full document order. `blockOrder` is the source of durable sibling order for local blocks. Repeated inserts after the same anchor, first/last row moves, paste, and delete all depend on the next full block array being saved atomically with page metadata.

Guard this behavior with `src/db/queries/block-collection-ops.test.ts`; it verifies that structural replacement accepts both page and block collection mutations and writes the expected `blockOrder`. Container-child lift/remove (for example empty list or checklist item → text) uses the same structural replacement path.

## Server baseline hash

When a seeded local page exists and `hashPageBlocks(server.blocks) !== serverBaselineHash`, the page is stale.

- **Revert to latest** → replace local blocks with server JSON, refresh hash
- **Keep my version** → update `serverBaselineHash` only

## Author dev mode

In `import.meta.env.DEV`, author can save working copy directly to JSON — see [author-dev-mode](./author-dev-mode.md). Saving to source deletes the local page metadata and block shard for that id.

## Migration

On first client load, legacy `site-local-pages` documents that still embed `blocks[]` are split into metadata + block shards (`site-local-storage-v2` flag). See `migrateLocalStorageToV2` in `src/db/collections/migrate-local-storage.ts`.

**User page id routes:** `MigrateUserPageRoutesEffect` (`useMigrateUserPageRoutes`) fixes shadowed/duplicate user metadata slugs and redirects legacy slug bookmarks to `/p/$pageId`. Progress is keyed in `localStorage` as `site-user-page-routes-v1`. Implementation: [`migrate-user-page-routes.ts`](../../src/lib/pages/migrate-user-page-routes.ts).
