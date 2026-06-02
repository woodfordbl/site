# Pages capability

## Page kinds

| Kind | Source | Route |
|------|--------|-------|
| Server | `content/pages/**/*.json` | `/`, `/$` (splat path) |
| User | `localPagesCollection` (`serverBaselineHash: null`) | `/p/$pageId` |

User-created pages navigate by stable **page id**. The `slug` field remains metadata for the sidebar tree, export (`Save to source`), and nested paths — it is not the browser URL for user pages. Shipped pages and lazy-seeded edits of shipped pages keep slug routes.

Legacy slug bookmarks for user pages redirect once to `/p/$pageId` on load (`MigrateUserPageRoutesEffect`).

## Nesting

Pages form a tree via `parentId` on each page document. Each page stores a metadata `slug` path (for example `/work/projects`) used for the sidebar tree, export, and descendant prefix renames. **Browser URLs** follow page kind: shipped and lazy-seeded pages use the slug path on `/` or `/$`; user-created pages use `/p/$pageId` regardless of nesting depth.

The sidebar lists **top-level pages** and shows nested pages under expandable parent rows when toggled open. Ancestors of the current page auto-expand on navigation using `useActivePageRef()` (page id from `/p/:id`, slug from pathname).

| Rule | Detail |
|------|--------|
| Max depth | `MAX_PAGE_DEPTH = 3` path segments (`/a`, `/a/b`, `/a/b/c`) |
| Sibling slugs | Unique among user-created pages with the same `parentId` (metadata); navigation uses ids for user pages |
| Home children | Parent slug `/` produces top-level child URLs (`/notes`) while `parentId` still points at home |
| Server parents | Shipped and user pages can both be parents |
| Delete | `page.delete` removes user pages (and descendants) from local storage, or hides shipped pages locally via a `deletedAt` tombstone |
| Rename | Title edits replace only the last path segment; descendant slugs cascade when a prefix changes |

User-created pages may share a metadata slug prefix with shipped pages; routing does not depend on slug uniqueness against shipped paths.

### Nested user pages under server parents

| Concern | Mechanism |
|---------|-----------|
| Tree | `parentId` points at the server parent id |
| Metadata slug | `buildChildSlug(parent.slug, segment)` — e.g. `/previous-work/my-notes` |
| Browser URL | `/p/{childPageId}` via `resolvePageNavTarget` |
| Slash **New Page** on a shipped page | `page.create` with `parentId: currentPageId`, `navigate: false` |
| Delete active child | `resolveDeleteRedirectTarget` opens the parent at its **slug** route |

## Navigation

`mergePageList` adds `routeBy: "id" | "slug"` to each merged `PageSummary`. Sidebar rows, page links, and delete redirects call `resolvePageNavTarget(pageId, pages)` — user pages → `/p/$pageId`; shipped/lazy-seed → slug route. Active page detection uses `useActivePageRef()` so `/p/uuid` and slug paths both drive sidebar highlight and ancestor expand.

Legacy slug bookmarks for user pages redirect once to `/p/$pageId` (`UserSlugPageClient` on the splat route and `MigrateUserPageRoutesEffect` on boot).

## Create flow

1. `page.create` → insert user page + navigate to `/p/{pageId}` (`parentId: null` for top-level, or set for subpages)
2. `PageWorkspace` renders editable title + canvas with one empty text block
3. **Slash menu → New Page** creates a child page titled “New Page” and converts the current block to a page link (stays on the current page)
4. **Slash menu → Link To Page** opens a native searchable submenu (`DropdownMenuSub` + search input + `DropdownMenuItem` targets) to pick an existing page and insert a page link block
5. Canvas always shows at least one row (see [Empty canvas](#empty-canvas))

## Page links

`pageLink` blocks store a `pageId` reference only — label text is resolved at render time from the merged page list via `usePageSummary`. The canvas slash menu receives the merged page list from the page canvas editor so row components do not subscribe independently. Renaming a page updates sidebar links, slash menu entries, and every `pageLink` block automatically. Missing pages render as “Missing page”.

## Title editing

All pages show an inline-editable title in `PageWorkspace` (`PageTitleEditor`), including shipped server pages such as home. Title and slug persist synchronously to `localPagesCollection` on each keystroke (sidebar, URL, and canvas read the same live collection). Shipped server pages lazy-seed a local document on the first title or block edit. Home keeps slug `/` when the title changes; other shipped pages replace the last path segment. Slug sync uses `history.replaceState` for **non-user-created** pages only. User pages on `/p/$pageId` keep a stable URL when the title changes; metadata `slug` still updates for tree/export.

## Empty canvas

`normalizeEditablePageBlocks` in `use-page-canvas.ts` guarantees every page can be edited immediately:

- Zero blocks → one normal empty `text` row.
- Last top-level row is not empty `text` → append one normal trailing empty `text` row so there is always a place to type at the bottom. Additional blank rows from Enter or gutter insert are kept as-is.
- Last top-level row is already empty `text` → no extra trailing row is added.

New blank rows use regular block ids and are persisted through the same full-order structural write path as gutter inserts when a content or structural edit needs them. New user pages are created with the first empty block persisted. Backspace/Delete on the sole empty row is a no-op so the page never returns to zero rows.

Canvas block order for a page is stored on the page metadata as `blockOrder`. Local page documents also store `createdAt` (immutable after insert) and `updatedAt`; see [local-first-persistence](./local-first-persistence.md). Structural canvas edits update that metadata in the same transaction as the page's local block rows; see [local-first-persistence](./local-first-persistence.md#ordering-invariant). Block types on the canvas (including checklist containers with `checklistItem` children, divider, and numbered lists) are documented in [block-model](./block-model.md) and [canvas-editor](./canvas-editor.md).

## Page list

The sidebar `PageList` shows a merged tree of pages — shipped pages from `content/pages/**/*.json` (via `listPages`) plus user-created pages in `localPagesCollection`. Top-level rows appear at the root; pages with children show a chevron toggle that reveals nested sub-pages indented below. The branch containing the active page auto-expands on navigation. Edited server pages use the local title/slug/parentId when a local document exists for the same `page.id`. No separate “server” vs “your pages” sections. The root route loader prefetches the list into React Query so the sidebar stays stable across navigations.

Each row is a full-width **ghost** button that navigates to the page. **Right-click** opens a context menu:

| Action | Behavior |
|--------|----------|
| Duplicate page | Clones blocks (remapped ids) into a new sibling page titled `Copy of …` and navigates there |
| Rename | Inline title field; persists on each change via `persistPageMetadata` (lazy-seeds shipped pages like the canvas title) |
| Delete | Confirms, then `page.delete`; disabled for home (`/`) and when it would leave zero pages |

Deleting the active page navigates to the parent page (or home) via `resolveDeleteRedirectTarget` → `resolvePageNavTarget`.

## Slug rules

Metadata slugs for user-created pages are deduped among **user-created siblings** with the same `parentId`. Nested server pages are stored at nested paths under `content/pages/` matching their slug (for example `/previous-work/altitude` → `content/pages/previous-work/altitude.json`).

Home keeps slug `/` when the title changes — only the display title updates. Other shipped pages replace the last path segment on rename. After a slug change, the splat route resolves edited server pages from `localPagesCollection` by slug or stable `page.id`. User page metadata slugs are allocated with `allocateUserPageSlug` (deduped among user-created siblings only).

## Route migration

`MigrateUserPageRoutesEffect` (mounted in `db/provider.tsx`) runs once per catalog snapshot:

1. `planUserPageSlugMigrations` renames user pages whose metadata slug shadows a shipped path or duplicates another user slug.
2. `findLegacyUserSlugRedirect` sends `/my-notes`-style bookmarks to `/p/{pageId}`.
3. Progress is stored in `localStorage` (`site-user-page-routes-v1`) so the effect does not loop.
