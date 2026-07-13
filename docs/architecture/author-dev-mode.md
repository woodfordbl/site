# Author dev mode

**Dev disk mode makes most of this automatic.** By default `pnpm dev` runs with
disk as the source of truth: every edit debounce-flushes to `content/**.md`,
external file edits stream into open canvases, and Save all is only needed to
compact leftover local state — see
[markdown-content-format — Dev disk mode](./markdown-content-format.md#dev-disk-mode).
`VITE_DEV_DISK=0` restores the legacy flow below.

## Workflow

1. Run `pnpm dev`
2. Edit any page in the canvas (title, blocks, or both)
3. **Save all** in site settings **Development** → writes every locally-edited page to `content/pages/**.md` (canonical markdown; folder/index layout for pages with children) using the live title, slug, `parentId`, and optional `icon` from `localPagesCollection`. Asset-backed **media** blocks export blobs to `public/media/` first and rewrite props to site-relative URLs. Local databases export to their `content/databases/{id}/` folder (`index.md` + `rows.csv` — [markdown-content-format](./markdown-content-format.md)) (connector-synced rows excluded, unchanged databases skipped; the local copy is kept and its `serverBaselineHash` stamped — [databases — Shipped content](./databases.md#shipped-content)).
4. `git commit` + push → Vercel deploy

## Save all

[`saveAllLocalPages`](../../src/lib/content/save-all-pages.ts) is the single dev author action. It enumerates `localPagesCollection.toArray`, skips locally-deleted (tombstoned) rows, and for each remaining page rebuilds rows from the stored block shard ([`readBootstrapPageBlocks`](../../src/db/queries/read-bootstrap-page-blocks.ts) → `buildBlockTree`), then reuses the per-page pipeline (`exportPageDocument` → `preparePageDocumentForAuthorSave` → `saveMediaAssets` → `savePage`). After each page it clears local metadata + block shard, version-history snapshots (`clearPageSnapshots`), and `markPageClean`; one `sweepOrphanAssets` runs at the end (its live set now also unions snapshot-referenced asset ids — see [local-first-persistence — Page snapshots](./local-first-persistence.md#page-snapshots-version-history)). The panel reports a saved/failed summary; failures are collected per page without aborting the batch.

## Safety

- Only available when `import.meta.env.DEV`
- `savePage` validates with `pageSchema` (including `parentId`) before write; writes are atomic (tmp + rename) and stale files for a renamed page are removed
- Slug → file-path mapping rejects path traversal

## After save

- Delete the local page metadata and block shard for that `pageId` so server JSON is canonical again, and clear its `site-local-dirty` cookie entry (`markPageClean`)
- Clear the page's version-history snapshots and its server-baseline content key ([`page-baseline-store.ts`](../../src/db/snapshots/page-baseline-store.ts))
- Run [`sweepOrphanAssets`](../../src/db/assets/asset-gc.ts) to reclaim IndexedDB blobs no longer referenced by any local `media` block (a sweep also runs on idle at boot — see [local-first-persistence](./local-first-persistence.md#local-media-assets-indexeddb-not-tanstack-collections))
- Reset author draft dirty state
- Normal blank canvas rows are exported with the page blocks, matching the editor's persisted row model

Shipped pages are bundled at build time via a raw-markdown `import.meta.glob` in [`page-store.server.ts`](../../src/lib/content/page-store.server.ts) and parsed by the canonical codec. In dev the main Vite watcher ignores `content/` (no reload churn from flushes); reads come fresh from the filesystem and the content-watch plugin delivers change events — [markdown-content-format](./markdown-content-format.md).

## Never

- Do not commit localStorage overrides as canonical content
- Do not expose `savePage` on production without auth
- Local-only metadata fields (`createdAt`, `updatedAt`) are not exported; the shipped markdown carries only the frontmatter fields in [`frontmatter.ts`](../../src/lib/markdown-canonical/frontmatter.ts)

Sidebar page actions (duplicate, rename, delete) only touch local collections. Dev/sync actions (**Refresh site content**, **Save all**, **Reset page**, **Reset all**) live in site settings **Development** ([`DevelopmentPanel`](../../src/components/settings/panels/development-panel.tsx)), opened from [`SiteSettingsTrigger`](../../src/components/settings/site-settings-trigger.tsx) via [`usePageCanvasFooterActions`](../../src/hooks/use-page-canvas-footer-actions.ts) — all global, none requiring editor state. On narrow viewports [`PageCanvasActionsDrawer`](../../src/components/canvas/page-canvas-actions-drawer.tsx) surfaces the same actions from the scrolling header when visible. Reset/refresh/save-all clear local state for the open page, so the workspace bumps a remount key on the canvas (`onAfterReset`) to re-read shipped data without a flash. See [site-settings](./site-settings.md).
