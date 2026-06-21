# Author dev mode

## Workflow

1. Run `pnpm dev`
2. Edit any page in the canvas (title, blocks, or both)
3. **Save** in the floating author toolbar → writes `content/pages/{slug-path}.json` (nested paths supported) using the live title, slug, `parentId`, and optional `icon` from `localPagesCollection`. Asset-backed **media** blocks export blobs to `public/media/` first and rewrite props to site-relative URLs.
4. `git commit` + push → Vercel deploy

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

Sidebar page actions (duplicate, rename, delete) only touch local collections. The author toolbar ([`PageCanvasFooter`](../../src/components/canvas/page-canvas-footer.tsx)) is a `fixed` cluster of `size="xs"` buttons in the **bottom-left** of the `bg-sidebar` surface (outside the inset card), surfacing **Save** (dev), **Reset** (local changes), and **Revert** / **Keep** ([`StaleBanner`](../../src/components/canvas/stale-banner.tsx)) when the server baseline drifts. The inset body scrolls full-height under [`PageHeader`](../../src/components/pages/page-header.tsx); the toolbar floats over the surface rather than occupying an in-flow footer.
