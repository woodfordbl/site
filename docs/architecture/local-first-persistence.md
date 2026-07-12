# Local-first persistence

> Scope: `src/lib/content/` also holds stateless SSR/build-time helpers that are **not** part of the persistence layer — e.g. metadata generation ([`page-head.ts`](../../src/lib/content/page-head.ts)) and the build-time origin constant ([`site-origin.ts`](../../src/lib/content/site-origin.ts)). Those are covered by [pages — Routing & SEO](./pages.md#routing--seo), not here.

## Two storage paths

| Path | Collection / file | Survives deploy |
|------|-------------------|-----------------|
| Server defaults | `content/pages/**/*.json` | Yes (git) |
| Local page metadata | `localPagesCollection` (`site-local-pages`) | No (localStorage) |
| Local blocks | `localBlocksCollection` (`site-local-blocks:<pageId>` shards) | No (localStorage) |
| Local databases | `localDatabasesCollection` (`site-local-databases`) | No (localStorage) |
| Local database rows | `localDatabaseRowsCollection` (`site-local-db-rows:<databaseId>` shards; quarantine `site-local-db-rows-quarantine`) | No (localStorage) |
| Local media blobs | IndexedDB `site-assets` / `assets` (`idb-keyval`, content-hash keys) | No |
| Page version history | IndexedDB `site-page-snapshots` / `snapshots` (`idb-keyval`, split index + per-checkpoint content keys) | No |
| Database sync bookkeeping | IndexedDB `site-db-sync-meta` / `meta` ([`sync-meta-store.ts`](../../src/db/sync/sync-meta-store.ts): etag, last sync/error, tombstone counts) | No |
| Connector tokens | `site-connector-tokens` (localStorage, client-only — [`token-store.ts`](../../src/lib/connectors/token-store.ts)) | No |

The database collections sync in `startLocalCollectionsSync` ([`local-collections.ts`](../../src/db/collections/local-collections.ts)) like the others; the rows collection carries a BTree index on `databaseId`. Row sharding, quarantine, ops, and reads (`useDatabase` / `useAllDatabases` / `useDatabaseRows` in [`use-database.ts`](../../src/db/queries/use-database.ts)): [databases — Storage](./databases.md#storage) (saved-view CRUD — `addDatabaseView` / `duplicateDatabaseView` / `removeDatabaseView` — and definition edits — `renameDatabase` / `setDatabaseIcon` — ride the same explicit-commit database transaction path as the other ops). Connector-synced rows are written by the client-side sync engine ([`database-sync-engine.ts`](../../src/db/sync/database-sync-engine.ts)) into the same row shards, so they propagate cross-tab via the existing storage events; mounted views of a synced table register ref-counted watchers (`watchDatabaseSync`) that accelerate the leader's poll to the connector floor ([`resolveWatchedInterval`](../../src/db/sync/sync-schedule.ts)) while visible: [databases — Connector sync](./databases.md#connector-sync). A row's lazily-materialized page (`row.pageId`, set by `setDatabaseRowPageId` on copy-on-write) is an ordinary user page in `localPagesCollection` plus its block shard — nested under the database's host page and flagged `databaseRowSource` so it stays out of the sidebar: [databases — Row pages](./databases.md#row-pages-virtual--copy-on-write).

## Local media assets (IndexedDB, not TanStack collections)

Uploaded images/gifs/videos for **`media`** blocks are stored outside `localBlocksCollection`:

- **Store:** [`src/db/assets/asset-store.ts`](../../src/db/assets/asset-store.ts) via `idb-keyval` (`createStore("site-assets", "assets")`).
- **Key:** SHA-256 hash of file bytes (content-addressed). Re-uploading the same file or copy-pasting a media block reuses the same blob — block props hold `{ source: "asset", src: "<hash>" }` plus optional `mimeType`, `fileName`, `alt`.
- **Display:** [`useAssetObjectUrl`](../../src/hooks/use-asset-object-url.ts) resolves hash → `URL.createObjectURL` with ref-counted cache.
- **GC:** Block delete does **not** remove blobs. [`sweepOrphanAssets`](../../src/db/assets/asset-gc.ts) deletes IndexedDB keys not referenced by any local `media` block **or** by a local page's [cover image](./pages.md#page-cover) (`collectCoverAssetIds` scans `site-local-pages` for `headerImage.source === "asset"`, so an uploaded cover is never reclaimed). It runs on idle at boot (scheduled by `startLocalCollectionsSync` in [`local-collections.ts`](../../src/db/collections/local-collections.ts)) and after dev **Save to source**. Assets stored this session are protected from the sweep (`wasAssetPutThisSession` in [`asset-store.ts`](../../src/db/assets/asset-store.ts)) so a just-uploaded blob is never reclaimed before its block (or cover) commits.
- **Author save:** DEV footer runs [`preparePageDocumentForAuthorSave`](../../src/lib/content/prepare-page-document-for-author-save.ts) + [`saveMediaAssets`](../../src/lib/content/save-media-assets.ts), writes referenced blobs to `public/media/<hash>.<ext>`, rewrites props to `source: "url"` paths, then `savePage` ([author-dev-mode](./author-dev-mode.md)).
- **Cover images:** a page's [cover](./pages.md#page-cover) reuses this same store for uploads (`headerImage.source === "asset"`); Unsplash covers are CDN-hotlinked (`source: "url"`, rendered sized via `unsplashCdnUrl`, never stored). The GC sweep above protects cover assets via `collectCoverAssetIds`.

URL-backed media (`source: "url"`) ships in page JSON without IndexedDB.

## Page snapshots (version history)

Locally-edited pages keep a tiered checkpoint history in IndexedDB (`createStore("site-page-snapshots", "snapshots")`, [`page-snapshot-store.ts`](../../src/db/snapshots/page-snapshot-store.ts)). The layout is deliberately **split** so capturing or pruning one checkpoint never rewrites the others' block payloads:

| Key | Value | Read when |
|-----|-------|-----------|
| `${pageId}:index` | `PageSnapshotIndex` — descriptor list (id, bucket, timestamp, content/metadata hash, counts, title) | timeline render, capture decision, thinning |
| `${pageId}:snap:${id}` | `PageSnapshotContent` — blocks + order + title + icon + settings | restore (one read), capture (one write) |

- **Capture** ([`capture-page-snapshot.ts`](../../src/lib/pages/capture-page-snapshot.ts)): a ~10s debounce (`schedulePageSnapshotCapture`) fired from the block-commit success path (`commitAndMarkDirty`) and from metadata/settings/reposition persists. `capturePageSnapshotNow` reads the page synchronously (`readBlockShardForPage` + `readLocalStorageCollection`), hashes the blocks (`hashPageBlocks`) and metadata (`hashPageMetadata`), and [`resolveSnapshotCaptureAction`](../../src/lib/pages/resolve-snapshot-capture-action.ts) decides skip / update-in-bucket / create. Each 10-minute wall-clock bucket (`bucketIdForTimestamp`) collapses to one checkpoint; unchanged content is skipped.
- **Retention** ([`thin-page-snapshots.ts`](../../src/lib/pages/thin-page-snapshots.ts)): coarsens over time — last 1h every 10-min bucket, 1–24h hourly, 24h–30d daily, 30d+ weekly, hard cap 40/page (most-recent always kept). Runs on every capture and on an idle boot purge ([`snapshot-purge.ts`](../../src/db/snapshots/snapshot-purge.ts), registered in `startLocalCollectionsSync`).
- **Restore** ([`restore-page-snapshot.ts`](../../src/lib/pages/restore-page-snapshot.ts)): re-applies the checkpoint's blocks via `applyPageBlockDiff` inside one `PageBlockTransaction` (ordering invariant) and restores title/icon/settings on `localPagesCollection`, then **rewinds the timeline** — every checkpoint newer than the restored one is purged (the restored point and older are kept). Surfaced by the [version-history picker](./pages.md#version-history) ([`PageVersionHistorySubmenu`](../../src/components/pages/page-version-history-submenu.tsx)); selecting a version takes over the page with a read-only preview ([`PageVersionPreview`](../../src/components/pages/page-version-preview.tsx) — `CanvasBlocksReadOnly mode="view"`, payload via [`usePageSnapshotContent`](../../src/db/queries/use-page-snapshot-content.ts)) before restoring.
- **Media safety:** checkpoints store only block props (the `assetId` reference), never blob bytes — restoring re-points at the existing `site-assets` blob. `sweepOrphanAssets` ([`asset-gc.ts`](../../src/db/assets/asset-gc.ts)) therefore unions snapshot-referenced asset ids into its live set so a blob held only by a checkpoint is not reclaimed.
- **Lifecycle:** `clearPageSnapshots` runs on **Reset page**, hard delete, **Reset all**, and author **Save to source**. All writes fail soft (best-effort; quota errors route to `reportPersistenceError` and never block an edit).

This replaces an earlier write-only per-edit event log (capped at 100, never surfaced); the checkpoint timeline is now the single **persisted** page-history surface. Fine-grained transaction-level undo within a session is separate and purely in-memory ([`page-edit-history.ts`](../../src/lib/canvas/page-edit-history.ts), recorded from the block-commit path in [`use-page-canvas.ts`](../../src/db/queries/use-page-canvas.ts)); `restorePageSnapshot` records one undo entry before applying, so a restore is itself Mod+Z-able — see [canvas-editor — Undo / redo](./canvas-editor.md#undo--redo).

## Local page document (metadata)

One metadata record per `page.id` in `localPagesCollection`:

- `id`, `slug`, `title`, `parentId`, optional `icon` (emoji or `tabler:IconName`; see [pages](./pages.md#page-icons))
- `sidebarOrder` — optional numeric sibling order within the same `parentId` scope for the sidebar tree (sparse steps like block ordering; title tiebreaker when unset)
- `blockOrder` — flat block ids in document order (updated on structural edits)
- `serverBaselineHash` — `hashPageBlocks(server.blocks)` at seed time; `null` for user-created pages
- `serverMetadataBaseline` — hash of shipped title/slug/icon/parent/sidebarOrder at lazy-seed; used with block hash for stale detection
- `deletedAt` — when set, the page is hidden locally (shipped JSON unchanged)
- `createdAt` — ISO timestamp set once at insert (lazy-seed uses first local edit time; never updated)
- `updatedAt`

Block content lives in `localBlocksCollection` (one row per block, keyed by `block.id`, with `pageId`, `createdAt` — set once at insert, preserved across updates — and `updatedAt`). Legacy rows missing `createdAt` are backfilled from `updatedAt` at boot by `backfillBlockCreatedAt` ([`migrate-local-storage.ts`](../../src/db/collections/migrate-local-storage.ts)). The block actions menu surfaces these as "Added / Last edited" ([`BlockGutterMenuTimestamps`](../../src/components/canvas/block-gutter-menu/block-gutter-menu-timestamps.tsx) via [`useLocalBlockTimestamps`](../../src/db/queries/use-local-block-timestamps.ts)).

## Local block rows

Each edited block is stored separately:

- All fields from the canvas `Block` schema
- `pageId` — owning page
- `updatedAt` — ISO timestamp for cross-tab last-write-wins merge

Physical storage uses **per-page shards** (`site-local-blocks:<pageId>`). TanStack DB still stringifies the whole collection on each write; the shard adapter ([`page-sharded-block-storage.ts`](../../src/db/collections/page-sharded-block-storage.ts)) diffs the serialized shard per page and only writes shards that changed, so typing on one page rewrites only that page's localStorage key.

**Schema-evolution quarantine:** blocks that fail `localBlockSchema` parse are dropped at read time and would otherwise be destroyed by the next shard overwrite. Before a shard write discards them, `quarantineUnparseableDroppedItems` copies the raw stored items to the `site-local-blocks-quarantine` localStorage key so a schema fix can recover them. Deliberate deletes are unaffected (a missing id that still parses is a real delete), and content-only writes skip the quarantine re-read via a per-shard id set.

## Lazy seed

Server pages are not copied to localStorage until the first edit. User-created pages are inserted on `page.create` with one empty `text` block in the blocks collection.

**Canvas invariants:** `usePageCanvas` applies `normalizeEditablePageBlocks` so every page has at least one block and at least one trailing empty top-level `text` row when the last stored row is not already blank. Blank rows use normal block ids and are persisted at the end of each structural transaction via [`CanvasPageSession`](../../src/lib/canvas/page-session.ts) + incremental collection ops in [`block-collection-ops.ts`](../../src/db/queries/block-collection-ops.ts).

## Reads

Route loader supplies server JSON for SSR and baseline. Client renders blocks from `localBlocksCollection` when any exist for the page, otherwise server blocks. Page metadata (title, slug, `blockOrder`) comes from `localPagesCollection` when present. `usePageBlocks` applies `blockOrder` to the page's local block rows before the canvas builds rows, so localStorage key order is never treated as document order. The sidebar merges shipped pages with local metadata via `mergePageList` (`routeBy: "slug"` on `/` or `/$`; `routeBy: "id"` for user-only pages → `/p/$` by metadata slug, not page UUID). User pages opened on `/$` redirect to `/p/…` ([`$.tsx`](../../src/routes/$.tsx), [`p.$.tsx`](../../src/routes/p.$.tsx)). The root route prefetches the page list into React Query.

## SSR dirty cookie

localStorage is unavailable during SSR, so a lightweight cookie (`site-local-dirty`) mirrors which pages have local draft data. The cookie stores comma-separated page ids; localStorage remains the source of truth on the client.

| Event | Cookie |
|-------|--------|
| First local edit (metadata or blocks) | `markPageDirty(pageId)` |
| Reset to server, page delete, save to source | `markPageClean(pageId)` |
| Client boot | `reconcileDirtyPagesCookie()` syncs cookie from `site-local-pages` + block shard keys |

Route loaders read the cookie on the server (`getDirtyPageIds` server fn via the isomorphic `loadDirtyPageIds`). Dirty pages still SSR: [`PageCanvas`](../../src/components/canvas/page-canvas.tsx) and [`PageTitleEditor`](../../src/components/pages/page-title-editor.tsx) render the server baseline during SSR even when `pageHasLocalDraft`, and the local draft swaps in after hydration — layout stays stable (no blank content area) and crawlers always see real content.

**Flash-free render swap:** the local read-only view lives in the **main bundle**, not the lazily-imported editor chunk, so a dirty refresh paints local content on the first client frame. [`page-canvas-server.tsx`](../../src/components/canvas/page-canvas-server.tsx) exports a shared `CanvasBlocksReadOnly` renderer; `PageCanvasServer` feeds it shipped blocks and [`PageCanvasLocalView`](../../src/components/canvas/page-canvas-local-view.tsx) feeds it the synchronous localStorage bootstrap ([`readBootstrapPageBlocks`](../../src/db/queries/read-bootstrap-page-blocks.ts)). On the client, `PageCanvas` renders the server view for the SSR-matching first render, then a `useLayoutEffect` (which flushes before the browser paints) swaps dirty pages to the local view — the static server frame is never shown. The editor chunk loads afterward and replaces the read-only view with identical markup (no layout shift). The editor chunk is also idle-prefetched ([`PrefetchPageCanvasEditorEffect`](../../src/components/canvas/prefetch-page-canvas-editor-effect.tsx)) so editing is ready quickly without blocking paint.

The cookie's remaining server-side job is 404 semantics: an unknown slug on `/$` throws a server-side `notFound()` unless the request carries dirty/preview cookies suggesting a matching local page ([`$.tsx`](../../src/routes/$.tsx)).

Implementation: `src/lib/local-draft/dirty-pages-cookie.ts`.

## SSR hint cookies

UI-hint cookies share read/write helpers in [`document-cookie.ts`](../../src/lib/cookies/document-cookie.ts). Writes are size-budget-guarded (~3800-byte encoded-value budget — browsers silently drop `document.cookie` writes over ~4 KB, which would freeze a stale value forever); `writeDocumentCookie` returns a boolean so callers can degrade instead.

- `site-local-dirty` — dirty page ids (above).
- `site-page-list-local` — dirty overlays, user-created pages, and delete tombstones ([`page-list-local-preview-cookie.ts`](../../src/lib/pages/page-list-local-preview-cookie.ts)); written synchronously on metadata persist/delete and by [`SyncPageListLocalPreviewEffect`](../../src/components/pages/sync-page-list-local-preview-effect.tsx). Tombstones and user pages first when over budget. Materialized database row pages (`databaseRowSource` on [`localPageSchema`](../../src/lib/schemas/local-page.ts)) are excluded — they are never sidebar-visible ([pages — Page list](./pages.md#page-list)), so mirroring them would only spend budget. **Loading priority:** no cookie → server only; cookie present → `mergePageList(server, cookie)` for SSR/hydration until `localPagesCollection` is ready, then live localStorage via [`mergeLocalPageSources`](../../src/lib/pages/merge-local-page-sources.ts) (preview + bootstrap merged while the collection initializes).
- `site-page-list-expanded` — sidebar chevron state. Read during SSR as `PageSidebarPrefs.expandedPageIds` ([`read-page-sidebar-prefs.server.ts`](../../src/lib/pages/read-page-sidebar-prefs.server.ts) / [`load-page-sidebar-prefs.ts`](../../src/lib/pages/load-page-sidebar-prefs.ts)) so the static sidebar shell renders the expanded tree plus active-page ancestors (`PageListContent` `initialExpandedIds` in [`page-list.tsx`](../../src/components/pages/page-list.tsx)) — no collapse-then-expand flash.
- `site-device-layout` — client-measured narrow viewport + coarse primary pointer (`{"nv":0|1,"cp":0|1}`) written by [`SyncDeviceLayoutCookieEffect`](../../src/components/layout/device-layout-provider.tsx) after live `matchMedia`; read during SSR via [`readDeviceLayoutHintsFromRequest`](../../src/lib/device/parse-device-layout-from-request.server.ts) / [`loadDeviceLayoutHints`](../../src/lib/device/load-device-layout-hints.ts) so shell + canvas seed correctly on return visits. First visit falls back to Bowser UA + Client Hints inference — see [canvas-editor — Device signals](./canvas-editor.md#device-signals).

## Writes

- **Text / single-block edits:** `localBlocksCollection.update` for that block immediately (no 300ms debounce).
- **Structural edits** (insert, move, delete, split): one batched transaction per `runBlockTransaction` — incremental collection ops on the hot path; `applyPageBlockDiff` for bulk paste/columns.
- **Page metadata:** `persistPageMetadata`, `page.create`, and **`page.reposition`** (`persistPageReposition`) update `localPagesCollection` (`parentId`, `sidebarOrder`, `slug`, `title`). Reposition may lazy-seed a shipped page (or parent, when nest-appending a `pageLink`) before writing.
- **Sidebar nest → parent canvas:** when `appendPageLinkOnParent` is set, `appendChildPageLinkFromShard` appends a `pageLink` block at the end of the parent’s block list via `applyPageBlockDiff` / `replacePageBlocks` (skipped if that `pageId` is already linked).
- **Cross-tab sync:** TanStack DB `storage` events on page metadata and block shard keys; the canvas reads blocks from `useLiveQuery` (`usePageBlocks`). Typing writes through the transaction path on each keystroke — there is no separate draft overlay. When metadata sync changes a shipped page slug, passive tabs update the address bar via `useSyncPageUrl` (`history.replaceState` on `/$` only — user `/p/…` routes are skipped). The active tab updates the URL on title **blur** (`persistPageMetadata` with `syncUrl: true`) or immediately on `persistPageReposition` when the slug changes.

`applyPageBlockDiff` / `replacePageBlocks` are the durable-order boundary for bulk canvas structure. They must update `localPagesCollection.blockOrder` and the page's `localBlocksCollection` rows in the same TanStack DB transaction, and that transaction must accept mutations for both collections. Incremental hot-path ops follow the same rule inside `runBlockTransaction`. If the block rows are accepted without the page metadata mutation, later reads can combine new rows with stale `blockOrder` and render inserts or moves out of order.

## Draft-proxy invariant

TanStack DB `update` drafts are change-tracking proxies. Mutations must never spread
draft objects back into stored documents — zod v4 `z.record` keys reject proxied values
on the next write. Database view ops JSON-flatten drafts before rebuilding
(see [databases — Draft-proxy invariant](./databases.md#draft-proxy-invariant-mutations)).

## Sync meta ordering

Connector sync meta (`site-db-sync-meta`) persists a new ETag/missing-count
snapshot only after the row-apply transaction commit resolves — a failed apply
keeps the old ETag so the next poll refetches instead of freezing rows behind
a 304 (see [databases — Review-hardening invariants](./databases.md#review-hardening-invariants)).

## Persistence error surfacing

All block-collection transactions are created with `autoCommit: false` — the TanStack DB default auto-commits on the first `mutate()`, which would close the transaction mid-batch and make the explicit commit reject. Collection commits do not swallow errors. `commitAndMarkDirty` in [`block-collection-ops.ts`](../../src/db/queries/block-collection-ops.ts) commits the transaction, runs `markPageDirty` only after a **successful** commit, and reports failures to the central sink in [`persistence-errors.ts`](../../src/db/persistence-errors.ts) (`reportPersistenceError`, with quota detection for `QuotaExceededError`). [`AppProviders`](../../src/db/provider.tsx) mounts Sonner's [`Toaster`](../../src/components/ui/sonner.tsx); `reportPersistenceError` shows a persistent dismissible error toast when local saves fail — without it, a failed save leaves the optimistic in-memory state rendering as if everything persisted.

## Row tree

`buildBlockTree(blocks)` ([`block-tree.ts`](../../src/lib/blocks/block-tree.ts)) produces top-level rows + nested container children by `parentId`, preserving the already-applied `blockOrder` within each scope. `reconcileRowTrees` gives rebuilds structural sharing: rows whose block content and subtree are unchanged keep their previous object identity, so memoized row components bail out and a keystroke re-renders only the edited row. [`blocksFromLocalBlocks`](../../src/lib/schemas/local-block.ts) caches the `LocalBlock` → `Block` conversion per source object for the same reason — unchanged live-query emissions keep block identity.

## Ordering invariant

The canvas follows an editor-state ordering model: UI commands resolve a placement against the current row tree, mutate the flat block array, and persist the resulting full document order. `blockOrder` is the source of durable sibling order for local blocks. Repeated inserts after the same anchor, first/last row moves, paste, and delete all depend on the next full block array being saved atomically with page metadata.

Guard this behavior with `src/db/queries/block-collection-ops.test.ts`; it verifies that structural replacement accepts both page and block collection mutations and writes the expected `blockOrder`. Container-child lift/remove (for example empty list or checklist item → text) uses the same structural replacement path.

## Hybrid server + local merge

**Sidebar union rule:** `visiblePages = serverCatalog ∪ userPages − tombstones`. Pristine shipped pages (no local row) always read the latest bundled JSON. Lazy-seeded overlays (`serverBaselineHash` set) and user pages (`serverBaselineHash: null`) stay local-first until reset.

[`resolvePageCatalog`](../../src/lib/pages/resolve-page-state.ts) (`resolvePageState`, `PageOrigin`) is the shared resolver: `server`, `server-overridden`, `user`, `tombstoned`, `orphaned`. [`useMergedPageListItems`](../../src/hooks/use-page-list.ts) builds the sidebar from it via [`mergePageList`](../../src/lib/pages/merge-page-list.ts).

**Deploy freshness — new/removed pages:** [`getPagesCatalogRevision`](../../src/lib/content/page-store.server.ts) hashes shipped ids/slugs/titles. The root loader exposes `pagesCatalogRevision`; [`SyncPagesCatalogRevisionEffect`](../../src/components/pages/sync-pages-catalog-revision-effect.tsx) invalidates the React Query page list when the revision changes (new shipped pages appear without wiping local overlays).

**Deploy freshness — changed body content:** the catalog revision intentionally ignores block content, so a separate per-page **`contentHash`** ([`hashPageBlocks`](../../src/lib/content/block-hash.ts)) is added to each [`PageSummary`](../../src/lib/content/list-pages.ts) by `listPages`. [`findStaleOverriddenPageIds`](../../src/lib/pages/resolve-page-state.ts) (via [`isOverriddenSummaryContentStale`](../../src/lib/pages/resolve-page-state.ts)) flags an overridden shipped page stale when its `serverBaselineHash` no longer matches the shipped `contentHash` — no full-page fetch required. This is **content-only** by design (metadata-only hash drift is left to the per-open `computePageStaleState`) so a global pull never nags users over a slug/order hash. [`useSiteContentUpdates`](../../src/hooks/use-site-content-updates.ts) exposes the stale set to the settings **Refresh site content** action ([site-settings](./site-settings.md)).

**Reset / refresh:**

| Action | Command / helper | Effect |
|--------|------------------|--------|
| Reset one shipped page | `page.resetToRemote` / [`resetPageToRemote`](../../src/lib/pages/reset-page-to-remote.ts) (settings **Development** → **Reset page**) | Deletes local metadata + block shard; restores shipped baseline on next read |
| Reset everything | `page.resetAllToRemote` / [`resetAllToRemote`](../../src/lib/pages/reset-all-to-remote.ts) (settings **Development** → **Reset all**) | Clears all local pages, block shards, hint cookies; navigates home |
| Pull new shipped content | Settings **Refresh site content** / [`refreshSiteContent`](../../src/lib/pages/refresh-site-content.ts) | Runs `resetPageToRemote` for each content-stale overridden page only; unrelated local edits and user pages are kept |

The workspace bumps a canvas remount key (`onAfterReset`) after these actions so the open page re-reads fresh data without a flash. Orphan overlays (local row for a removed shipped id) are detected by [`findOrphanLocalPages`](../../src/lib/pages/resolve-page-state.ts); [`OrphanLocalPagesEffect`](../../src/components/pages/orphan-local-pages-effect.tsx) prompts to discard.

## Workspace backup

Settings **Backup** ([`BackupPanel`](../../src/components/settings/panels/backup-panel.tsx)) exports or imports the local workspace as a versioned `.zip` archive (`WORKSPACE_ARCHIVE_APP` = `personal-site`, `WORKSPACE_ARCHIVE_VERSION` = 1 in [`workspace-archive.ts`](../../src/lib/content/workspace-archive.ts)). Layout: `manifest.json`, `pages/{pageId}.json` (full `pageSchema` documents + block shards inlined at export), and `media/{assetId}.{ext}` for referenced IndexedDB blobs. Zipping/unzipping uses `fflate` (async worker).

| Action | UI | Behavior |
|--------|-----|----------|
| Export workspace | **Export** in Backup | [`exportWorkspaceArchive`](../../src/lib/content/workspace-export.ts) → [`collectWorkspacePages`](../../src/lib/content/collect-workspace-pages.ts) gathers every visible page + asset ids, downloads `personal-site-workspace-{date}.zip`. Referenced blobs missing from IndexedDB are skipped and reported. |
| Export page | Header ⋯ **Export page** | [`exportPageArchive`](../../src/lib/content/workspace-export.ts) — same archive format for one page + its media via [`collectWorkspacePage`](../../src/lib/content/collect-workspace-pages.ts) (`personal-site-page-{slug}.zip`). Re-importable via merge. |
| Import | [`DropUpload`](../../src/components/ui/drop-upload.tsx) or file picker → [`WorkspaceImportDialog`](../../src/components/settings/workspace-import-dialog.tsx) | [`importWorkspaceArchive`](../../src/lib/content/workspace-import.ts): **Replace** runs [`resetAllToRemote`](../../src/lib/pages/reset-all-to-remote.ts) first; **Merge** overlays pages by id. Fatal validation throws [`WorkspaceImportError`](../../src/lib/content/workspace-import.ts) before any write; per-page issues are listed. Restores media with [`putAsset`](../../src/db/assets/asset-store.ts), writes page metadata + block shards, then [`syncPageListLocalPreviewFromCollection`](../../src/lib/pages/page-list-local-preview-cookie.ts). Import completion can bump the canvas remount key via `onAfterImport`. |

## Server baseline hash

When a seeded local page exists and either `hashPageBlocks(server.blocks) !== serverBaselineHash` or shipped metadata hash differs from `serverMetadataBaseline`, the page is stale ([`computePageStaleState`](../../src/lib/pages/resolve-page-state.ts), used for per-open detection). The global settings pull is content-only (`contentHash` vs `serverBaselineHash`); resolving a stale page is a full [`resetPageToRemote`](../../src/lib/pages/reset-page-to-remote.ts) that drops the local overlay (metadata + blocks) so the next read restores the shipped baseline.

## Author dev mode

In `import.meta.env.DEV`, author can save working copy directly to JSON — see [author-dev-mode](./author-dev-mode.md). Saving to source deletes the local page metadata and block shard for that id.

## App boot effects (`AppProviders`)

[`AppProviders`](../../src/db/provider.tsx) mounts client-only effects before `TooltipProvider` (none writes to TanStack collections). It does **not** wrap a `QueryClientProvider` — the router's ssr-query integration already provides the query client its loaders populate; wrapping again would shadow it with an empty client on the server and break SSR query reads:

| Effect | When | Purpose |
|--------|------|---------|
| [`MigrateUserPageRoutesEffect`](../../src/components/pages/migrate-user-page-routes-effect.tsx) | First catalog snapshot | User page slug repair for shadowed/duplicate paths ([Migration](#migration)) |
| [`SyncPageListLocalPreviewEffect`](../../src/components/pages/sync-page-list-local-preview-effect.tsx) | Mount + every `localPagesCollection` change | Mirrors local page sidebar metadata into the `site-page-list-local` cookie ([SSR hint cookies](#ssr-hint-cookies)) |
| [`WarmPageIconPickerCacheEffect`](../../src/components/pages/warm-page-icon-picker-cache-effect.tsx) | `scheduleIdleCallback` on every route | Best-effort [`warmPageIconPickerChunks`](../../src/lib/pages/preload-page-icon-picker.ts): code-split emoji + icon panel chunks only (catalog JSON loads on picker intent) |
| [`PrefetchPageCanvasEditorEffect`](../../src/components/canvas/prefetch-page-canvas-editor-effect.tsx) | `scheduleIdleCallback` | Idle-prefetch the canvas editor chunk so editing is ready without blocking first paint |

Importing `local-collections.ts` at the top of the provider also kicks off `startLocalCollectionsSync` (migrations, dirty-cookie reconcile, collection sync, idle orphan-asset sweep).

## Client-only icon/emoji assets (not in TanStack collections)

Page icon catalogs are separate from page/block persistence. [`preload-page-icon-picker.ts`](../../src/lib/pages/preload-page-icon-picker.ts) owns cached dynamic imports of [`PageIconPickerEmojiPanel`](../../src/components/pages/page-icon-picker-emoji-panel.tsx) and [`PageIconPickerIconPanel`](../../src/components/pages/page-icon-picker-icon-panel.tsx). Global idle warm loads panel chunks only; `ensurePageIconPickerReady` (pointer enter / popover open) also runs `prefetchPageIconCatalogs`, warming two self-hosted JSON assets into TanStack Query (`staleTime: Infinity`):

- Emoji — `/emojibase/en/data.json` from [`PAGE_ICON_EMOJIBASE_URL`](../../src/lib/pages/page-icon-emojibase.ts), copied at dev/build via `pnpm sync:emojibase` (`scripts/sync-emojibase-public.mjs`).
- Tabler icons — `/tabler/icons.json`, generated at dev/build via `pnpm sync:icons` (`scripts/sync-tabler-icons-public.mjs`) from the installed `@tabler/icons-react` glyph data (all ~6,100 icons as `{ name, keywords, filled, node }`). The same script writes `src/generated/tabler-icons.json`, the bundled copy used for SSR glyph rendering ([`read-tabler-glyphs.server.ts`](../../src/lib/pages/read-tabler-glyphs.server.ts)) — the server never reads `public/` at runtime.

Neither asset is stored in `site-local-pages` shards, and neither is statically imported on the page-render path, so they never land in the first-paint bundle. Passive Tabler display uses SSR glyphs plus optional by-name server fetches; the full JSON catalogs load only when the picker opens. Picker layout and tab UX: [pages — Page icons](./pages.md#page-icons).

## Migration

On first client load, legacy `site-local-pages` documents that still embed `blocks[]` are split into metadata + block shards (`site-local-storage-v2` flag). See `migrateLocalStorageToV2` in `src/db/collections/migrate-local-storage.ts`.

**Formula references:** `startLocalCollectionsSync` also canonicalizes stored database formula expressions — name references (`thisPage.X`) rewrite to the field-id form (`prop("<id>")`) once the databases collection is live ([`formula-ref-migration.ts`](../../src/db/queries/formula-ref-migration.ts)). Idempotent (unchanged expressions are never written) and lossless (unparseable expressions and unresolvable names pass through untouched); see [formula-language — Property references](./formula-language.md#property-references-id-canonical).

**User page routes:** `MigrateUserPageRoutesEffect` (`useMigrateUserPageRoutes`) fixes shadowed/duplicate user metadata slugs via [`planUserPageSlugMigrations`](../../src/lib/pages/migrate-user-page-routes.ts). Progress is keyed in `localStorage` as `site-user-page-slugs-v1`. Implementation: [`migrate-user-page-routes.ts`](../../src/lib/pages/migrate-user-page-routes.ts).
