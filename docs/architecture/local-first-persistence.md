# Local-first persistence

## Two storage paths

| Path | Collection / file | Survives deploy |
|------|-------------------|-----------------|
| Server defaults | `content/pages/**/*.json` | Yes (git) |
| Local page metadata | `localPagesCollection` (`site-local-pages`) | No (localStorage) |
| Local blocks | `localBlocksCollection` (`site-local-blocks:<pageId>` shards) | No (localStorage) |
| Local media blobs | IndexedDB `site-assets` / `assets` (`idb-keyval`, content-hash keys) | No |

## Local media assets (IndexedDB, not TanStack collections)

Uploaded images/gifs/videos for **`media`** blocks are stored outside `localBlocksCollection`:

- **Store:** [`src/db/assets/asset-store.ts`](../../src/db/assets/asset-store.ts) via `idb-keyval` (`createStore("site-assets", "assets")`).
- **Key:** SHA-256 hash of file bytes (content-addressed). Re-uploading the same file or copy-pasting a media block reuses the same blob — block props hold `{ source: "asset", src: "<hash>" }` plus optional `mimeType`, `fileName`, `alt`.
- **Display:** [`useAssetObjectUrl`](../../src/hooks/use-asset-object-url.ts) resolves hash → `URL.createObjectURL` with ref-counted cache.
- **GC:** Block delete does **not** remove blobs. [`sweepOrphanAssets`](../../src/db/assets/asset-gc.ts) deletes IndexedDB keys not referenced by any local `media` block. It runs on idle at boot (scheduled by `startLocalCollectionsSync` in [`local-collections.ts`](../../src/db/collections/local-collections.ts)) and after dev **Save to source**. Assets stored this session are protected from the sweep (`wasAssetPutThisSession` in [`asset-store.ts`](../../src/db/assets/asset-store.ts)) so a just-uploaded blob is never reclaimed before its block commits.
- **Author save:** DEV footer runs [`preparePageDocumentForAuthorSave`](../../src/lib/content/prepare-page-document-for-author-save.ts) + [`saveMediaAssets`](../../src/lib/content/save-media-assets.ts), writes referenced blobs to `public/media/<hash>.<ext>`, rewrites props to `source: "url"` paths, then `savePage` ([author-dev-mode](./author-dev-mode.md)).

URL-backed media (`source: "url"`) ships in page JSON without IndexedDB.

## Local page document (metadata)

One metadata record per `page.id` in `localPagesCollection`:

- `id`, `slug`, `title`, `parentId`, optional `icon` (emoji or `tabler:IconName`; see [pages](./pages.md#page-icons))
- `sidebarOrder` — optional numeric sibling order within the same `parentId` scope for the sidebar tree (sparse steps like block ordering; title tiebreaker when unset)
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

The cookie's remaining server-side job is 404 semantics: an unknown slug on `/$` throws a server-side `notFound()` unless the request carries dirty/preview cookies suggesting a matching local page ([`$.tsx`](../../src/routes/$.tsx)).

Implementation: `src/lib/local-draft/dirty-pages-cookie.ts`.

## SSR hint cookies

UI-hint cookies share read/write helpers in [`document-cookie.ts`](../../src/lib/cookies/document-cookie.ts). Writes are size-budget-guarded (~3800-byte encoded-value budget — browsers silently drop `document.cookie` writes over ~4 KB, which would freeze a stale value forever); `writeDocumentCookie` returns a boolean so callers can degrade instead.

- `site-local-dirty` — dirty page ids (above).
- `site-page-list-local` — minimal local-page sidebar mirror for SSR first paint ([`page-list-local-preview-cookie.ts`](../../src/lib/pages/page-list-local-preview-cookie.ts), written by [`SyncPageListLocalPreviewEffect`](../../src/components/pages/sync-page-list-local-preview-effect.tsx)). When over budget, `writePageListLocalPreviewToDocument` sorts entries user-pages-first (they affect routing; shipped overlays are cosmetic title/icon) and truncates until the write fits — SSR paints a best-known subset and the client reconciles after hydration.
- `site-page-list-expanded` — sidebar chevron state. Read during SSR as `PageSidebarPrefs.expandedPageIds` ([`read-page-sidebar-prefs.server.ts`](../../src/lib/pages/read-page-sidebar-prefs.server.ts) / [`load-page-sidebar-prefs.ts`](../../src/lib/pages/load-page-sidebar-prefs.ts)) so the static sidebar shell renders the expanded tree plus active-page ancestors (`PageListContent` `initialExpandedIds` in [`page-list.tsx`](../../src/components/pages/page-list.tsx)) — no collapse-then-expand flash.

## Writes

- **Text / single-block edits:** `localBlocksCollection.update` for that block immediately (no 300ms debounce).
- **Structural edits** (insert, move, delete, split): one batched transaction per `runBlockTransaction` — incremental collection ops on the hot path; `applyPageBlockDiff` for bulk paste/columns.
- **Page metadata:** `persistPageMetadata`, `page.create`, and **`page.reposition`** (`persistPageReposition`) update `localPagesCollection` (`parentId`, `sidebarOrder`, `slug`, `title`). Reposition may lazy-seed a shipped page (or parent, when nest-appending a `pageLink`) before writing.
- **Sidebar nest → parent canvas:** when `appendPageLinkOnParent` is set, `appendChildPageLinkFromShard` appends a `pageLink` block at the end of the parent’s block list via `applyPageBlockDiff` / `replacePageBlocks` (skipped if that `pageId` is already linked).
- **Cross-tab sync:** TanStack DB `storage` events on page metadata and block shard keys; the canvas reads blocks from `useLiveQuery` (`usePageBlocks`). Typing writes through the transaction path on each keystroke — there is no separate draft overlay. When metadata sync changes a shipped page slug, passive tabs update the address bar via `useSyncPageUrl` (`history.replaceState` on `/$` only — user `/p/…` routes are skipped). The active tab updates the URL on title **blur** (`persistPageMetadata` with `syncUrl: true`) or immediately on `persistPageReposition` when the slug changes.

`applyPageBlockDiff` / `replacePageBlocks` are the durable-order boundary for bulk canvas structure. They must update `localPagesCollection.blockOrder` and the page's `localBlocksCollection` rows in the same TanStack DB transaction, and that transaction must accept mutations for both collections. Incremental hot-path ops follow the same rule inside `runBlockTransaction`. If the block rows are accepted without the page metadata mutation, later reads can combine new rows with stale `blockOrder` and render inserts or moves out of order.

## Persistence error surfacing

All block-collection transactions are created with `autoCommit: false` — the TanStack DB default auto-commits on the first `mutate()`, which would close the transaction mid-batch and make the explicit commit reject. Collection commits do not swallow errors. `commitAndMarkDirty` in [`block-collection-ops.ts`](../../src/db/queries/block-collection-ops.ts) commits the transaction, runs `markPageDirty` only after a **successful** commit, and reports failures to the central sink in [`persistence-errors.ts`](../../src/db/persistence-errors.ts) (`reportPersistenceError`, with quota detection for `QuotaExceededError`). [`AppProviders`](../../src/db/provider.tsx) mounts Sonner's [`Toaster`](../../src/components/ui/sonner.tsx); `reportPersistenceError` shows a persistent dismissible error toast when local saves fail — without it, a failed save leaves the optimistic in-memory state rendering as if everything persisted.

## Row tree

`buildBlockTree(blocks)` ([`block-tree.ts`](../../src/lib/blocks/block-tree.ts)) produces top-level rows + nested container children by `parentId`, preserving the already-applied `blockOrder` within each scope. `reconcileRowTrees` gives rebuilds structural sharing: rows whose block content and subtree are unchanged keep their previous object identity, so memoized row components bail out and a keystroke re-renders only the edited row. [`blocksFromLocalBlocks`](../../src/lib/schemas/local-block.ts) caches the `LocalBlock` → `Block` conversion per source object for the same reason — unchanged live-query emissions keep block identity.

## Ordering invariant

The canvas follows an editor-state ordering model: UI commands resolve a placement against the current row tree, mutate the flat block array, and persist the resulting full document order. `blockOrder` is the source of durable sibling order for local blocks. Repeated inserts after the same anchor, first/last row moves, paste, and delete all depend on the next full block array being saved atomically with page metadata.

Guard this behavior with `src/db/queries/block-collection-ops.test.ts`; it verifies that structural replacement accepts both page and block collection mutations and writes the expected `blockOrder`. Container-child lift/remove (for example empty list or checklist item → text) uses the same structural replacement path.

## Server baseline hash

When a seeded local page exists and `hashPageBlocks(server.blocks) !== serverBaselineHash`, the page is stale.

- **Revert to latest** → replace local blocks with server JSON, refresh hash
- **Keep my version** → update `serverBaselineHash` only

## Author dev mode

In `import.meta.env.DEV`, author can save working copy directly to JSON — see [author-dev-mode](./author-dev-mode.md). Saving to source deletes the local page metadata and block shard for that id.

## App boot effects (`AppProviders`)

[`AppProviders`](../../src/db/provider.tsx) mounts three client-only effects before `TooltipProvider` (none writes to TanStack collections). It does **not** wrap a `QueryClientProvider` — the router's ssr-query integration already provides the query client its loaders populate; wrapping again would shadow it with an empty client on the server and break SSR query reads:

| Effect | When | Purpose |
|--------|------|---------|
| [`MigrateUserPageRoutesEffect`](../../src/components/pages/migrate-user-page-routes-effect.tsx) | First catalog snapshot | User page slug repair for shadowed/duplicate paths ([Migration](#migration)) |
| [`SyncPageListLocalPreviewEffect`](../../src/components/pages/sync-page-list-local-preview-effect.tsx) | Mount + every `localPagesCollection` change | Mirrors local page sidebar metadata into the `site-page-list-local` cookie ([SSR hint cookies](#ssr-hint-cookies)) |
| [`WarmPageIconPickerCacheEffect`](../../src/components/pages/warm-page-icon-picker-cache-effect.tsx) | `requestIdleCallback` on every route | Best-effort [`warmPageIconPicker`](../../src/lib/pages/preload-page-icon-picker.ts): code-split emoji + icon panel chunks and `prefetchPageIconCatalogs` (both catalog assets into the TanStack Query cache) |

Importing `local-collections.ts` at the top of the provider also kicks off `startLocalCollectionsSync` (migrations, dirty-cookie reconcile, collection sync, idle orphan-asset sweep).

## Client-only icon/emoji assets (not in TanStack collections)

Page icon catalogs are separate from page/block persistence. The warm effect and picker preload share [`preload-page-icon-picker.ts`](../../src/lib/pages/preload-page-icon-picker.ts): cached dynamic imports of [`PageIconPickerEmojiPanel`](../../src/components/pages/page-icon-picker-emoji-panel.tsx) and [`PageIconPickerIconPanel`](../../src/components/pages/page-icon-picker-icon-panel.tsx) plus `prefetchPageIconCatalogs`, which warms two self-hosted JSON assets into TanStack Query (`staleTime: Infinity`):

- Emoji — `/emojibase/en/data.json` from [`PAGE_ICON_EMOJIBASE_URL`](../../src/lib/pages/page-icon-emojibase.ts), copied at dev/build via `pnpm sync:emojibase` (`scripts/sync-emojibase-public.mjs`).
- Tabler icons — `/tabler/icons.json`, generated at dev/build via `pnpm sync:icons` (`scripts/sync-tabler-icons-public.mjs`) from the installed `@tabler/icons-react` glyph data (all ~6,100 icons as `{ name, keywords, filled, node }`). The same script writes `src/generated/tabler-icons.json`, the bundled copy used for SSR glyph rendering ([`read-tabler-glyphs.server.ts`](../../src/lib/pages/read-tabler-glyphs.server.ts)) — the server never reads `public/` at runtime.

Neither asset is stored in `site-local-pages` shards, and neither is statically imported on the page-render path, so they never land in the first-paint bundle. [`PageIconDisplay`](../../src/components/pages/page-icon-display.tsx) reads the Tabler catalog with `enabled: false` so a page with a `tabler:` icon paints the default glyph first and upgrades once the idle warm populates the cache. Picker layout and tab UX: [pages — Page icons](./pages.md#page-icons).

## Migration

On first client load, legacy `site-local-pages` documents that still embed `blocks[]` are split into metadata + block shards (`site-local-storage-v2` flag). See `migrateLocalStorageToV2` in `src/db/collections/migrate-local-storage.ts`.

**User page routes:** `MigrateUserPageRoutesEffect` (`useMigrateUserPageRoutes`) fixes shadowed/duplicate user metadata slugs via [`planUserPageSlugMigrations`](../../src/lib/pages/migrate-user-page-routes.ts). Progress is keyed in `localStorage` as `site-user-page-slugs-v1`. Implementation: [`migrate-user-page-routes.ts`](../../src/lib/pages/migrate-user-page-routes.ts).
