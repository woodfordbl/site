# Author dev mode

## Workflow

1. Run `pnpm dev`
2. Edit any page in the canvas (title, blocks, or both)
3. **Save to source** in the page footer → writes `content/pages/{slug-path}.json` (nested paths supported) using the live title, slug, and `parentId` from `localPagesCollection`
4. `git commit` + push → Vercel deploy

## Safety

- Only available when `import.meta.env.DEV`
- `savePage` validates with `pageSchema` (including `parentId`) before write
- Slug → filename mapping rejects path traversal

## After save

- Delete the local page metadata and block shard for that `pageId` so server JSON is canonical again
- Reset author draft dirty state
- Normal blank canvas rows are exported with the page blocks, matching the editor's persisted row model

## Never

- Do not commit localStorage overrides as canonical content
- Do not expose `savePage` on production without auth
- Local-only metadata fields (`createdAt`, `updatedAt`) are not exported; shipped JSON uses `pageSchema` only

Sidebar page actions (duplicate, rename, delete) only touch local collections; **Save to source** remains in the canvas footer.
