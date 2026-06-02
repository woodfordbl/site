# Page commands

Page lifecycle commands are separate from canvas block commands (see [canvas-commands](./canvas-commands.md)). Block rendering on a page uses `BLOCK_SPECS` via `BlockTreeNode` / `BlockRenderer` (including checklist, divider, and numbered list blocks; see [block-types](../architecture/block-types.md)).

| Command | Meaning |
|---------|---------|
| `page.create` | New user page + navigate to `/p/{pageId}`; optional `parentId`, `pageId`, `navigate: false`, `initialBlocks` |
| `page.update` | Update title/slug metadata via `page.persist` (no router navigate effect) |
| `page.delete` | Remove user pages (hard delete) or hide shipped pages locally (`deletedAt` tombstone); always keeps at least one page and never deletes home |

Effects: `page.persist` (insert/update metadata in `localPagesCollection`, blocks in `localBlocksCollection`), `page.delete`, `navigate` (`router` to `/p/$pageId` on create; `history` mode calls `syncPageUrl` for shipped slug renames only). Inserts set `createdAt` and `updatedAt` once; updates bump `updatedAt` only.

`page.create` accepts optional `parentId` and `initialBlocks`. When `initialBlocks` is non-empty, those blocks are seeded instead of the default empty text row (used by sidebar **Duplicate page**). When set, the new page metadata slug is built from the parent path plus a slugified title segment. Duplicate segments are suffixed among **user-created siblings** via `allocateUserPageSlug` (`notes-2`, etc.). Creation is rejected when the parent is already at `MAX_PAGE_DEPTH`. Pass `navigate: false` to create a page without leaving the current canvas (used by slash **New Page**). Default title is `New Page`. Optional `pageId` lets callers pre-assign the id before inserting a matching `pageLink` block. Slash menu page rows are built by [`buildRootSlashMenuItems`](../../src/lib/canvas/slash-menu-list.ts) from the canvas editor's merged page list (filtered **New Page** + **Link To Page** trigger); choosing **Link To Page** opens a native submenu to dispatch `slash.convert` with the selected `pageId`.

Title edits on shipped pages use `persistPageMetadata` with a lazy seed (same as the first block edit). User pages have `serverBaselineHash: null` and one empty `text` block row in `localBlocksCollection`. Pages with content ending in a non-blank block get a normal trailing empty `text` row from `normalizeEditablePageBlocks`; multiple user blank rows at the end are preserved. Renaming a shipped page updates only its last path segment and cascades prefix changes to descendant metadata slugs; the address bar updates via `syncPageUrl` when `routeBy !== "id"`. User pages keep `/p/$pageId` when the title changes. Deleting the active page uses `resolveDeleteRedirectTarget` (parent slug route or home).

Canvas structural commands also update page metadata because `localPagesCollection.blockOrder` is the durable block order for the page. The page metadata mutation and block row mutations must be accepted in the same structural transaction; see [canvas-commands](./canvas-commands.md).

## Page list

`listPages` (server fn) reads all `content/pages/**/*.json` metadata. The sidebar merges that list with user pages in `localPagesCollection` via `mergePageList`, then shows top-level pages only (`parentId: null`). The root loader prefetches `pageListQueryOptions` into React Query (`staleTime: Infinity`) to avoid sidebar flash on route changes. Sidebar rename persists through `persistPageMetadata` on each change (same lazy-seed rules as the canvas title).
