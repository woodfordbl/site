# Author dev mode

## Workflow

1. Run `pnpm dev`
2. Edit any page in the canvas (title, blocks, or both)
3. **Save all** in site settings **Development** → writes every locally-edited page to `content/pages/{slug-path}.json` (nested paths supported) using the live title, slug, `parentId`, optional `icon`, and authored `createdAt`/`updatedAt` from `localPagesCollection` (last-edited is the max of page + block timestamps via [`resolvePageLastEditedAt`](../../src/lib/pages/page-activity-summary.ts)). Asset-backed **media** blocks export blobs to `public/media/` first and rewrite props to site-relative URLs. Local databases export to `content/databases/{id}.json` (connector-synced rows excluded, unchanged databases skipped; the local copy is kept and its `serverBaselineHash` stamped — [databases — Shipped content](./databases.md#shipped-content)).
4. `git commit` + push → Vercel deploy

## Save all

[`saveAllLocalPages`](../../src/lib/content/save-all-pages.ts) is the single dev author action. Order of operations:

1. Enumerate `localPagesCollection.toArray`, skip locally-deleted (tombstoned) rows and template pages
2. For each remaining page: rebuild rows from the block shard ([`readBootstrapPageBlocks`](../../src/db/queries/read-bootstrap-page-blocks.ts) → `buildBlockTree`) → `exportPageDocument` → `preparePageDocumentForAuthorSave` → `saveMediaAssets` → [`savePage`](../../src/lib/content/save-page.ts). Successful writes accumulate the **persisted** documents (after [`preserveShippedCreatedAt`](../../src/lib/content/preserve-shipped-created-at.ts))
3. Call optional `beforeClearLocal(savedPages)` so the client can seed React Query before overlays tear down
4. Clear local overlays **only** for successfully saved pages (metadata + block shard, `clearPageSnapshots`, `markPageClean`); failed pages keep their overlay
5. Export local databases, then one `sweepOrphanAssets` (live set also unions snapshot-referenced asset ids — see [local-first-persistence — Page snapshots](./local-first-persistence.md#page-snapshots-version-history))

The panel reports a saved/failed summary; failures are collected per page without aborting the batch.

### `savePage`

[`savePage`](../../src/lib/content/save-page.ts) writes `content/pages/{slug-path}.json`, runs [`preserveShippedCreatedAt`](../../src/lib/content/preserve-shipped-created-at.ts) (match by **id**), primes the shared catalog via [`primeShippedPage`](../../src/lib/content/shipped-pages-cache.ts) (not `page-store.server.ts` — keeps the client-imported RPC legal under TanStack Start import-protection), and returns `{ ok, page, path }` with the persisted document. A cold cache initializes inside the handler with a dynamic `import("./page-store.server.ts")` so the static client graph never edges into `*.server.*`.

## Safety

- Only available when `import.meta.env.DEV`
- `savePage` validates with `pageSchema` (including `parentId`) before write
- Slug → filename mapping rejects path traversal
- [`preserveShippedCreatedAt`](../../src/lib/content/preserve-shipped-created-at.ts) looks up the prior shipped page **by id** (survives slug renames) and keeps its `createdAt` so a lazy-seed local stamp never clobbers authored history; `updatedAt` always comes from the export
- [`shipped-pages-cache.ts`](../../src/lib/content/shipped-pages-cache.ts) is the only in-memory catalog the write path may touch from the RPC module; `page-store.server.ts` owns the eager glob and is reached only via that cold-cache dynamic import

## After save

Client footer ([`use-page-canvas-footer-actions.ts`](../../src/hooks/use-page-canvas-footer-actions.ts)) implements `beforeClearLocal` by calling [`publishSavedPageToClient`](../../src/lib/content/publish-saved-page-to-client.ts) for each saved page (seeds React Query `pageBySlugQueryOptions` + the page list). It does **not** await `router.invalidate()` — Start SSR-revalidation can hang on client-only trees; open routes (`/` and `/$`) already subscribe to those keys via `useQuery`, so `setQueryData` updates `serverPage` props before local clear.

Then, for each successfully saved page:

- Delete local page metadata and block shard so shipped JSON is canonical again; clear `site-local-dirty` (`markPageClean`)
- Clear version-history snapshots and the server-baseline content key ([`page-baseline-store.ts`](../../src/db/snapshots/page-baseline-store.ts))
- Reset author draft dirty state

After the batch: run [`sweepOrphanAssets`](../../src/db/assets/asset-gc.ts) (also on idle at boot — see [local-first-persistence](./local-first-persistence.md#local-media-assets-indexeddb-not-tanstack-collections)). Normal blank canvas rows export with the page blocks, matching the editor's persisted row model.

Shipped pages are bundled at build/dev time via `import.meta.glob` in [`page-store.server.ts`](../../src/lib/content/page-store.server.ts); the glob is HMR-aware, so a dev save to `content/pages/` is picked up without restarting the dev server. `primeShippedPage` covers the immediate post-save window before HMR lands.

## Never

- Do not commit localStorage overrides as canonical content
- Do not expose `savePage` on production without auth
- Local-only fields that are not part of `pageSchema` stay out of shipped JSON; authored `createdAt`/`updatedAt` **are** on `pageSchema` and round-trip through Save all (see [pages — Page stats](./pages.md#page-stats))

Sidebar page actions (duplicate, rename, delete) only touch local collections. Dev/sync actions (**Refresh site content**, **Save all**, **Reset page**, **Reset all**) live in site settings **Development** ([`DevelopmentPanel`](../../src/components/settings/panels/development-panel.tsx)), opened from [`SiteSettingsTrigger`](../../src/components/settings/site-settings-trigger.tsx) via [`usePageCanvasFooterActions`](../../src/hooks/use-page-canvas-footer-actions.ts) — all global, none requiring editor state. On narrow viewports [`PageCanvasActionsDrawer`](../../src/components/canvas/page-canvas-actions-drawer.tsx) surfaces the same actions from the scrolling header when visible. Reset/refresh/save-all clear local state for the open page, so the workspace bumps a remount key on the canvas (`onAfterReset`) to re-read shipped data without a flash. See [site-settings](./site-settings.md).
