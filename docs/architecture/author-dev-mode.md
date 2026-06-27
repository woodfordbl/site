# Author dev mode

## Workflow

1. Run `pnpm dev`
2. Edit any page in the canvas (title, blocks, or both)
3. **Save all** in the author toolbar → writes every locally-edited page to `content/pages/{slug-path}.json` (nested paths supported) using the live title, slug, `parentId`, and optional `icon` from `localPagesCollection`. Asset-backed **media** blocks export blobs to `public/media/` first and rewrite props to site-relative URLs.
4. `git commit` + push → Vercel deploy

## Save all

[`saveAllLocalPages`](../../src/lib/content/save-all-pages.ts) is the single dev author action (the footer no longer offers a per-page Save). It enumerates `localPagesCollection.toArray`, skips locally-deleted (tombstoned) rows, and for each remaining page rebuilds rows from the stored block shard ([`readBootstrapPageBlocks`](../../src/db/queries/read-bootstrap-page-blocks.ts) → `buildBlockTree`), then reuses the per-page pipeline (`exportPageDocument` → `preparePageDocumentForAuthorSave` → `saveMediaAssets` → `savePage`). After each page it clears local metadata + block shard, version-history snapshots (`clearPageSnapshots`), and `markPageClean`; one `sweepOrphanAssets` runs at the end (its live set now also unions snapshot-referenced asset ids — see [local-first-persistence — Page snapshots](./local-first-persistence.md#page-snapshots-version-history)). The footer reports a saved/failed summary; failures are collected per page without aborting the batch.

## Safety

- Only available when `import.meta.env.DEV`
- `savePage` validates with `pageSchema` (including `parentId`) before write
- Slug → filename mapping rejects path traversal

## After save

- Delete the local page metadata and block shard for that `pageId` so server JSON is canonical again, and clear its `site-local-dirty` cookie entry (`markPageClean`)
- Run [`sweepOrphanAssets`](../../src/db/assets/asset-gc.ts) to reclaim IndexedDB blobs no longer referenced by any local `media` block (a sweep also runs on idle at boot — see [local-first-persistence](./local-first-persistence.md#local-media-assets-indexeddb-not-tanstack-collections))
- Reset author draft dirty state
- Normal blank canvas rows are exported with the page blocks, matching the editor's persisted row model

Shipped pages are bundled at build/dev time via `import.meta.glob` in [`page-store.server.ts`](../../src/lib/content/page-store.server.ts); the glob is HMR-aware, so a dev save to `content/pages/` is picked up without restarting the dev server.

## Never

- Do not commit localStorage overrides as canonical content
- Do not expose `savePage` on production without auth
- Local-only metadata fields (`createdAt`, `updatedAt`) are not exported; shipped JSON uses `pageSchema` only

Sidebar page actions (duplicate, rename, delete) only touch local collections. The author toolbar ([`PageCanvasFooter`](../../src/components/canvas/page-canvas-footer.tsx)) is rendered at **workspace level** ([`page-workspace.tsx`](../../src/components/pages/page-workspace.tsx)), decoupled from the lazily-loaded editor chunk, so it is always present. It surfaces **Refresh site content** (when shipped content the user overrode has changed), **Save all** (dev), and **Reset page** / **Reset all** (local changes) via [`usePageCanvasFooterActions`](../../src/hooks/use-page-canvas-footer-actions.ts) — all global, none requiring editor state. On desktop it is a cluster of `size="xs"` buttons in a strip below the inset card on the `bg-sidebar` surface. On mobile the strip is hidden; the same actions open from an `IconDots` trigger in the scrolling [`PageHeader`](../../src/components/pages/page-header.tsx) via [`PageCanvasActionsDrawer`](../../src/components/canvas/page-canvas-actions-drawer.tsx) (bottom [`Drawer`](../../src/components/ui/drawer.tsx)). Reset/refresh/save-all clear local state for the open page, so the workspace bumps a remount key on the canvas (`onAfterReset`) to re-read shipped data without a flash. The inset body scrolls full-height under `PageHeader`; the toolbar does not occupy in-flow footer space.
