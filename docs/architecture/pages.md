# Pages capability

## Page kinds

| Kind | Source | Route |
|------|--------|-------|
| Server | `content/pages/**/*.json` | `/`, `/$` (metadata slug splat) |
| User | `localPagesCollection` (`serverBaselineHash: null`) | `/p/$` (metadata slug splat — not a UUID segment; e.g. `/p/notes`, `/p/work/notes`) |

Shipped and lazy-seeded pages load on `/` or `/$` ([`src/routes/$.tsx`](../../src/routes/$.tsx)). User-created pages (no matching shipped JSON) load on [`src/routes/p.$.tsx`](../../src/routes/p.$.tsx) via [`pageNavTargetForUserPage`](../../src/lib/pages/slugify.ts). Slugs unknown to the server catalog throw a server-side `notFound()` (real 404) unless the request carries dirty/preview cookies suggesting a local page; cookie-flagged requests render `PendingSlugPage`/`PendingSlugPageClient`, which resolves the slug client-side. If a user page is opened on `/$` first (e.g. `/notes`), the client `replace`-redirects to `/p/notes` ([`PendingSlugPageClient`](../../src/routes/$.tsx)). Stable **page id** (UUID) remains the document key in collections, sidebar drag payloads, and `pageLink` props — it is not encoded in the browser path.

Boot migration ([`useMigrateUserPageRoutes`](../../src/hooks/use-migrate-user-page-routes.ts) via [`MigrateUserPageRoutesEffect`](../../src/components/pages/migrate-user-page-routes-effect.tsx)) renames user metadata slugs that shadow shipped paths or duplicate another user slug ([Route migration](#route-migration)).

## Nesting

Pages form a tree via `parentId` on each page document. Each page stores a metadata `slug` path (for example `/work/projects`) used for the sidebar tree, export, descendant prefix renames, and browser URLs on `/` or `/$`.

The sidebar builds a nested tree from `parentId` via [`buildPageTree`](../../src/lib/pages/build-page-tree.ts) (`PageRow` with `children`, sibling `sortOrder` index) and shows expandable parent rows when toggled open. Siblings sort with [`comparePageSiblings`](../../src/lib/pages/page-sidebar-order.ts) (`sidebarOrder`, then title). [`mergePageList`](../../src/lib/pages/merge-page-list.ts) overlays local title, `parentId`, `sidebarOrder`, and `icon` (local `icon ?? serverPage.icon` when a local doc exists) and drops server rows with a local `deletedAt` tombstone. Chevron open/close state persists across refreshes in the `site-page-list-expanded` cookie ([`page-list-expanded-cookie.ts`](../../src/lib/pages/page-list-expanded-cookie.ts); [`PageListContent`](../../src/components/pages/page-list.tsx) hydrates on mount, writes on each `expandedIds` change, and prunes ids missing from the merged list). The cookie is also read during SSR (`PageSidebarPrefs.expandedPageIds` via [`read-page-sidebar-prefs.server.ts`](../../src/lib/pages/read-page-sidebar-prefs.server.ts)) so the static sidebar shell renders the expanded tree before hydration. Ancestors of the current page auto-expand on navigation using `useActivePageRef()` (metadata slug from `/`, `/$`, or `/p/…`) and are merged into that persisted set. Cookie contract: [page-commands — Sidebar expand state](../reference/page-commands.md#sidebar-expand-state).

### Sidebar drag-and-drop

In `PageWorkspace`, the shadcn [`PageSidebar`](../../src/components/pages/page-sidebar.tsx) shell wraps `PageList` and supports HTML5 drag-and-drop on each row except home (no separate grip — the whole row is draggable, same click-vs-drag threshold as the canvas gutter via [`useDragSource`](../../src/components/dnd/use-dnd.ts) + [`usePointerClickVsDrag`](../../src/hooks/use-pointer-click-vs-drag.ts); quick click still navigates, chevron/delete stop propagation). [`PageListContent`](../../src/components/pages/page-list.tsx) uses [`DndSurface`](../../src/components/dnd/dnd-surface.tsx) with an empty native drag image and a React [`DragOverlay`](../../src/components/dnd/drag-overlay.tsx) preview ([`PageListDragPreview`](../../src/components/pages/page-list-drag-preview.tsx)), not the default link URL chip. Toolkit overview: [drag-and-drop](./drag-and-drop.md).

| Gesture | Result |
|---------|--------|
| Drop on row (middle band) | Nest under that page (`parentId`), append last among its children, append a `pageLink` (`variant: child`) to the end of the parent canvas (skipped if a link to that page already exists) |
| Drop between rows (top/bottom band) | Set `parentId` to the gap’s scope (root gap → `parentId: null`) and insert at that sibling position via `sidebarOrder` |
| Drag toward the left edge | Drop targets unnest to root or an ancestor scope ([`page-list-preview-depth.ts`](../../src/lib/pages/page-list-preview-depth.ts)); row indent updates only after drop |
| Drag parent row | Subtree follows (`parentId` chain on descendants unchanged) |
| Drop a sidebar page onto an open canvas | Insert a child `pageLink` at the drop position and re-nest the dragged page under the open page — the cross-surface counterpart of "drop on row (middle band)", guarded by [`canDropPageIntoCanvas`](../../src/lib/pages/page-canvas-drop.ts) |

Repositions dispatch `page.reposition` via [`usePageDispatch`](../../src/hooks/use-page-dispatch.ts) (`pageReducer` → `page.reposition` [`PageEffect`](../../src/lib/canvas/effects.ts) with [`PageRepositionPlan`](../../src/lib/pages/reposition-page.ts); failed [`planPageReposition`](../../src/lib/pages/reposition-page.ts) / [`assertCanReposition`](../../src/lib/pages/reposition-page.ts) yields **no effects**). Before dispatch, [`PageListContent`](../../src/components/pages/page-list.tsx) lazy-seeds shipped rows (and the nest parent when appending a `pageLink`) via [`loadPage`](../../src/lib/content/load-page.ts) + [`hashPageBlocks`](../../src/lib/content/block-hash.ts), passing optional `seed` / `parentSeed` ([`PageMetadataSeed`](../../src/lib/pages/persist-page-metadata.ts)) on the command. The sidebar `<nav>` spreads `useDropZone` props; [`DndSurface`](../../src/components/dnd/dnd-surface.tsx) snapshots row bounds with [`collectRects`](../../src/lib/dnd/rects.ts) on [`PAGE_LIST_ROW_ATTRIBUTE`](../../src/lib/pages/resolve-page-list-drop-target.ts). Metadata updates go through [`persistPageReposition`](../../src/lib/pages/persist-page-reposition.ts) (`parentId`, `sidebarOrder`, `slug`, descendant prefix cascade). Nest drops may call [`appendChildPageLinkFromShard`](../../src/lib/pages/append-page-link-on-parent.ts) on the parent canvas. [`PageListContent`](../../src/components/pages/page-list.tsx) attaches `nav` ref bounds for pointer X when resolving drops. Drop resolution uses [`resolve-page-list-drop-target.ts`](../../src/lib/pages/resolve-page-list-drop-target.ts) on visible rows from [`flattenVisiblePageRows`](../../src/lib/pages/flatten-visible-page-rows.ts) (three-band hit testing on `[data-page-list-row-id]` plus horizontal unnest via [`page-list-preview-depth.ts`](../../src/lib/pages/page-list-preview-depth.ts); not the canvas [`resolve-drop-target`](../../src/lib/canvas/resolve-drop-target.ts) block resolver). Drag MIME: `PAGE_DRAG_MIME_TYPE` (`application/x-page-id`, [`page-canvas-drop.ts`](../../src/lib/pages/page-canvas-drop.ts)) via [`createDragChannel`](../../src/lib/dnd/drag-channel.ts) in [`PageListContent`](../../src/components/pages/page-list.tsx); the canvas drop zone sniffs the same MIME to accept page drops, reusing the seeding dispatch in [`usePageReposition`](../../src/hooks/use-page-reposition.ts). Invalid drops (self, descendant, depth overflow, no-op sibling insert) return no target. Persistence details: [local-first-persistence — Writes](./local-first-persistence.md#writes).

| Rule | Detail |
|------|--------|
| Max depth | `MAX_PAGE_DEPTH = 3` path segments (`/a`, `/a/b`, `/a/b/c`) |
| Sibling slugs | Unique among all pages with the same `parentId`; [`allocateUserPageSlug`](../../src/lib/pages/allocate-page-slug.ts) and [`buildSlugFromTitle`](../../src/lib/pages/build-page-tree.ts) dedupe segments via [`dedupePageSegment`](../../src/lib/pages/build-page-tree.ts) (`notes`, `notes-2`, …) |
| Home children | Parent slug `/` produces top-level child URLs (`/notes`) while `parentId` still points at home |
| Server parents | Shipped and user pages can both be parents |
| Delete | `page.delete` removes user pages (and descendants) from local storage, or hides shipped pages locally via a `deletedAt` tombstone |
| Rename | Title edits replace only the last path segment; descendant slugs cascade when a prefix changes |

User-created pages that would shadow a shipped slug at create/rename time receive an auto-incremented segment (`/new-page-2`, …). Boot migration ([`planUserPageSlugMigrations`](../../src/lib/pages/migrate-user-page-routes.ts)) repairs any remaining shadowed or duplicate slugs.

### Nested user pages under server parents

| Concern | Mechanism |
|---------|-----------|
| Tree | `parentId` points at the server parent id |
| Metadata slug | `buildChildSlug(parent.slug, segment)` — e.g. `/previous-work/my-notes` |
| Browser URL | `/p/…` metadata slug (e.g. `/p/previous-work/my-notes`) via [`resolvePageNavTarget`](../../src/lib/pages/resolve-page-nav-target.ts) (`routeBy: "id"`) |
| Slash **New Page** on a shipped page | `page.create` with `parentId: currentPageId`, `navigate: false` |
| Delete active child | `resolveDeleteRedirectTarget` opens the parent at its **slug** route |

## Navigation

[`mergePageList`](../../src/lib/pages/merge-page-list.ts) sets `PageSummary.routeBy`: **`slug`** for shipped rows (with or without a local overlay) and **`id`** for user-only pages (`serverBaselineHash: null`, not in the server catalog). The `"id"` value means “route under `/p/` using metadata slug” — not “put page UUID in the URL.” Sidebar rows, `pageLink` targets, and delete redirects call [`resolvePageNavTarget(pageId, pages)`](../../src/lib/pages/resolve-page-nav-target.ts): `routeBy: "id"` → [`pageNavTargetForUserPage`](../../src/lib/pages/slugify.ts) (`/p/$` splat); otherwise → [`pageNavTarget`](../../src/lib/pages/slugify.ts) (home → `/`, else `/$` splat). [`resolveDeleteRedirectTarget`](../../src/lib/pages/resolve-page-nav-target.ts) walks to the parent’s resolved target, or home.

[`syncPageUrl`](../../src/lib/pages/sync-url.ts) updates the address bar without a router navigation: default paths are `/` or `/{slug-segments}`; pass `{ userPage: true }` when `routeBy === "id"` so the path is `/p/{slug-segments}`. [`usePageDispatch`](../../src/hooks/use-page-dispatch.ts) passes `userPage: true` on `page.create` `navigate` effects (`/p/{slug}`). Title and sidebar rename persist metadata on each change but call `syncPageUrl` only on **blur** ([`PageTitleEditor`](../../src/components/pages/page-title-editor.tsx) `syncUrl: true`; sidebar rename `stopRenaming`) so the active tab keeps a stable URL while typing. [`persistPageReposition`](../../src/lib/pages/persist-page-reposition.ts) syncs immediately when a reposition changes the slug. Passive tabs for shipped pages use [`useSyncPageUrl`](../../src/hooks/use-sync-page-url.ts) (`/$` paths only — skips user pages). Active page detection uses [`useActivePageRef`](../../src/hooks/use-active-page-ref.ts) — normalized metadata slug from `/`, `/$`, or `/p/…` (no UUID segment parsing).

[`src/routes/p.$.tsx`](../../src/routes/p.$.tsx) resolves the splat slug through [`useResolvedUserPage`](../../src/hooks/use-resolved-page.ts) → [`resolveActiveUserPageBySlug`](../../src/lib/pages/resolve-user-page-by-slug.ts), which matches only live user rows (`serverBaselineHash: null`, no `deletedAt`). Soft-deleted shipped overlays (`deletedAt` + `local-delete-tombstone` baseline) can remain in `localPagesCollection` after `page.delete` but are ignored for `/p/…` routing so a new `page.create` at the same metadata slug does not 404. [`mergePageList`](../../src/lib/pages/merge-page-list.ts) already hides those tombstones from the sidebar; slug allocation uses the merged list, so a recreated slug may match a tombstone row until create runs.

## Routing & SEO

`/` and `/$` declare route `head()` with per-page title, description, Open Graph, and Twitter meta via [`page-head.ts`](../../src/lib/content/page-head.ts) (`buildPageMeta`; description derived from the first non-empty text blocks) plus a `<link rel="canonical">` from `buildPageLinks`. `buildPageMeta` emits `og:image`/`twitter:image` (1200×630, `twitter:card: summary_large_image`) and `og:url` pointing at the dynamic card endpoint [`routes/api/og.get.ts`](../../routes/api/og.get.ts) — a Nitro handler that renders the title/description into a PNG via `@vercel/og` (`ImageResponse`; Geist bundled as the default font), registered explicitly in [`vite.config.ts`](../../vite.config.ts) so it ships in the Vercel build output. Absolute `og:image`/`og:url`/canonical URLs use the build-time `SITE_ORIGIN` ([`site-origin.ts`](../../src/lib/content/site-origin.ts)), baked via the `VITE_SITE_ORIGIN` Vite define from the shared origin resolver ([`scripts/resolve-origin.mjs`](../../scripts/resolve-origin.mjs)) so SSR and client render identical strings (no hydration mismatch). `/p/$` uses `buildNoIndexMeta` (`robots: noindex`, no card) and SSRs the `SiteShell` so hydration swaps content, not layout (no blank document). Site-wide favicon / PWA icons + `theme-color` are declared in [`__root.tsx`](../../src/routes/__root.tsx) against the “BW” monogram set ([`manifest.json`](../../public/manifest.json), generated by [`scripts/generate-icons.mjs`](../../scripts/generate-icons.mjs) / `pnpm gen:icons`). [`scripts/generate-sitemap.mjs`](../../scripts/generate-sitemap.mjs) writes `public/sitemap.xml` + `robots.txt` (disallowing `/p/`) at build when `VERCEL_PROJECT_PRODUCTION_URL` or `SITE_ORIGIN` is set, sharing the same origin resolver. Unknown slugs on `/$` are a server-side `notFound()` — see [Page kinds](#page-kinds).

`useLocalPages` treats an empty collection snapshot as ambiguous: Vite HMR can reload the collection module empty before sync repopulates, but deleting the last local page also empties it. It re-reads `site-local-pages` from localStorage to disambiguate — real deletions persist there, so an empty store means genuinely no local pages (no ghost sidebar rows after deleting the last page).

**Instant navigation:** the `/` and `/$` loaders route shipped content through React Query (`context.queryClient.ensureQueryData(pageBySlugQueryOptions(slug))`, [`page-query.ts`](../../src/lib/content/page-query.ts), `staleTime: Infinity`) instead of calling `loadPage` directly. With `defaultPreload: "intent"` ([`router.tsx`](../../src/router.tsx)) hover preloads the loader and the cache is reused on click, so navigation is instant and revisits never re-fetch.

Shipped page content is **bundled at build time** via [`page-store.server.ts`](../../src/lib/content/page-store.server.ts) (`import.meta.glob` over `content/pages/**/*.json`) — `loadPage`/`listPages` never read the filesystem at request time, which keeps deployed serverless functions reliable (the glob stays HMR-aware for author dev saves). `listPages` projects `icon` into each `PageSummary`. The root loader prefetches Tabler glyphs for passive display via [`tablerIconNamesForSSR`](../../src/lib/pages/tabler-icon-names-from-pages.ts) and [`getSidebarTablerGlyphs`](../../src/lib/pages/get-sidebar-tabler-glyphs.ts). The full glyph catalog used on the server is bundled from `src/generated/tabler-icons.json` ([`read-tabler-glyphs.server.ts`](../../src/lib/pages/read-tabler-glyphs.server.ts); written by `scripts/sync-tabler-icons-public.mjs`), not read from `public/` at runtime.

## Create flow

1. `page.create` → [`purgeSlugTombstonesForUserPageCreate`](../../src/lib/pages/resolve-user-page-by-slug.ts) (same slug + `parentId` scope), insert user page, then `navigate` to the allocated metadata slug (`parentId: null` for top-level, or set for subpages)
2. `PageWorkspace` renders editable title + canvas with one empty text block
3. **Slash menu → New Page** creates a child page titled “New Page” and converts the current block to a `pageLink` with `props.variant: child` (stays on the current page; no external arrow icon)
4. **Slash menu → Link To Page** opens a native searchable submenu (`DropdownMenuSub` + search input + `DropdownMenuItem` targets) to pick an existing page and insert a `pageLink` with `props.variant: linked` (shows external arrow icon)
5. Canvas always shows at least one row (see [Empty canvas](#empty-canvas))

## Page links

`pageLink` blocks store `props.pageId` and an optional `props.variant`: `child` (slash **New Page** subpage on the current canvas) or `linked` (slash **Link To Page** reference to an existing page). Label text is resolved at render time from the merged page list via `usePageSummary`. [`pageLinkShowsExternalIcon`](../../src/lib/pages/page-link-display.ts) drives the arrow-up-right affordance: always hidden for `child`, always shown for `linked`. Blocks without `variant` infer from the target page and current canvas page id ([`usePageLinkCanvasPageId`](../../src/hooks/use-page-link-canvas-page-id.ts)): no icon when `target.parentId === canvasPageId` (direct child), otherwise show the icon. The canvas slash menu receives the merged page list from the page canvas editor so row components do not subscribe independently. Renaming a page updates sidebar links, slash menu entries, and every `pageLink` block automatically. Missing pages render as “Missing page”.

## Page icons

Pages may store an optional `icon` string on shipped JSON (`pageSchema`) and on `localPageSchema`. Encoding lives in [`page-icon.ts`](../../src/lib/pages/page-icon.ts):

| Stored value | Meaning |
|--------------|---------|
| *(unset)* | Default `IconFile` in the UI |
| `tabler:IconHome` | Tabler glyph; `decodePageIcon` returns `{ kind: "tabler", name }` and the glyph is resolved by name from the deferred catalog at render time (falls back to `DEFAULT_PAGE_ICON` until loaded) |
| Any other string | Emoji (rendered with `role="img"`) |

`listPages` projects `icon` into `PageSummary`. `mergePageList` uses `local.icon ?? serverPage.icon` when a local document exists so a title-only lazy-seed does not drop a shipped icon. Icon edits call `persistPageIcon` (wrapper around `persistPageMetadata`) and lazy-seed shipped pages like title edits. **Save to source** includes `icon` via `exportPageDocument`.

| Surface | Behavior |
|---------|----------|
| Page title | [`PageIconPicker`](../../src/components/pages/page-icon-picker.tsx) beside [`PageTitleEditor`](../../src/components/pages/page-title-editor.tsx) — ghost ShadCN [`Button`](../../src/components/ui/button.tsx) (`size="icon-lg"`) trigger; icon scale comes from the Button variant |
| Sidebar | [`PageIconDisplay`](../../src/components/pages/page-icon-display.tsx) in an [`iconSlotClassName("icon-xs")`](../../src/components/ui/button.tsx) wrapper on each row; edit via overflow menu or context menu **Change icon** (same picker popover, no row trigger — see [Page list](#page-list)) |
| Breadcrumbs | `iconSlotClassName("icon-sm")` wrapper |
| `pageLink` blocks | `iconSlotClassName("default")` wrapper from `usePageSummary` on the referenced page |
| Callouts | `iconSlotClassName("icon-sm")` in view; edit trigger uses `Button` `size="icon-sm"` via [`GlyphIconPicker`](../../src/components/pages/glyph-icon-picker.tsx) |

[`PageIconDisplay`](../../src/components/pages/page-icon-display.tsx) is a bare glyph renderer (emoji with `role="img"`, Tabler via [`TablerGlyph`](../../src/components/pages/tabler-glyph.tsx)) — it does not accept a `size` prop. Tabler SVG and emoji scale come from [`buttonIconChildClassNames`](../../src/components/ui/button.tsx) in [`button.tsx`](../../src/components/ui/button.tsx): interactive pickers rely on Button `icon-*` descendant selectors; inline surfaces wrap the display in [`iconSlotClassName`](../../src/components/ui/button.tsx) with the matching tier (`icon-xs`, `icon-sm`, `default`, etc.). There are no statically bundled Tabler components on the display path except `DEFAULT_PAGE_ICON` (`IconFile`), used as the instant fallback while the deferred catalog loads.

| Tier | Typical surface | Tabler SVG | Emoji |
|------|-----------------|------------|-------|
| `icon-xs` | Sidebar, drag preview | `size-4` | `text-sm` |
| `icon-sm` | Breadcrumbs, callouts | `size-5` | `text-base` |
| `default` | `pageLink` | `size-4` | `text-base` |
| `icon-lg` | Title picker trigger (via Button) | `size-7` | `text-[1.5rem]` |

**Picker UX** (`PageIconPicker`): `352px` popover (`w-[352px]`) with **Emoji** / **Icons** tabs on [`TabsList`](../../src/components/ui/tabs.tsx) `variant="line"` (underline indicator) inside a `relative px-2 pt-2` tab row; an `aria-hidden` `inset-x-0 bottom-0 border-b` divider spans the full popover width and the list auto-mounts a [`TabsIndicator`](../../src/components/ui/tabs.tsx) (`Tabs.Indicator`) that slides a `bg-primary` underline intersecting that divider (matching the embed link/upload tabs in [`link-upload-tabs.tsx`](../../src/components/ui/link-upload-tabs.tsx)); `initialFocus={false}`; inactive triggers use muted text, active trigger uses `text-primary`. Both tab panels use identical chrome (see table below). Selecting any emoji or Tabler glyph calls `persistPageIcon` and closes the popover. No loading spinners anywhere in the picker.

Both tabs render the same composable primitive, [`GridPicker`](../../src/components/ui/grid-picker.tsx), built on Base UI [`Autocomplete`](../../src/components/ui/grid-picker.tsx) (`inline grid virtualized` — filtering, `data-highlighted` keyboard grid navigation), [`@tanstack/react-virtual`](../../src/components/ui/grid-picker.tsx) (row windowing), and our design system: the search is `Autocomplete.Input render={<Input />}` and each cell is `Autocomplete.Item` styled with `buttonVariants({ variant: "ghost", size: "icon-lg" })` (Item keeps `role="option"` for a11y rather than nesting a real `<button>`). Filtering uses each item's `getSearchValue` (emoji: label + tags; icons: kebab `keywords`). Each cell carries a hover tooltip (the item's label) via a shared [`Tooltip`](../../src/components/ui/tooltip.tsx) handle, but the tooltip trigger is **skipped on coarse primary pointers** ([`useIsCoarsePrimaryPointer`](../../src/hooks/device-layout.ts)) — on touch the trigger's press handling otherwise swallowed the tap and blocked selection. Selecting any cell calls `persistPageIcon` and closes the popover. No loading spinners anywhere in the picker.

| Panel chrome | Emoji tab | Icons tab |
|--------------|-----------|-----------|
| `TabsContent` padding | `px-2 pb-2 pt-2` (tab row uses `px-2 pt-2` with a full-width `border-b` divider) | `px-2 pb-2 pt-2` |
| Search | `GridPicker` `Autocomplete.Input` rendered as ShadCN [`Input`](../../src/components/ui/input.tsx) — `h-8`, `mb-2` | Same |
| Scroll region | `GridPicker` Base UI [`ScrollArea`](../../src/components/ui/scroll-area.tsx) (`h-[320px]`, `fadeEdges` → `scroll-fade-y`); virtualizer `viewportRef` drives `getScrollElement`. The fade mask is driven by the viewport's `--scroll-area-overflow-y-start/end` vars, so each edge fade only appears once scrolled away from it (first/last rows stay opaque at rest) | Same |
| Grid | `Autocomplete.Row` per virtualized row, `grid` with `gridTemplateColumns: repeat(8, …)` and `gap-0.5`; absolutely positioned by the virtualizer | Same |
| Cell content | [`PageIconPickerEmojiPanel`](../../src/components/pages/page-icon-picker-emoji-panel.tsx) renders the emoji char | [`PageIconPickerIconPanel`](../../src/components/pages/page-icon-picker-icon-panel.tsx) renders [`TablerGlyph`](../../src/components/pages/tabler-glyph.tsx) |

Both tabs are code-split: preload resolves to a React component type stored in picker state. Callers must assign with a functional updater — `setEmojiPanel(() => Panel)` / `setIconPanel(() => Panel)` — because a bare function passed to `setState` (including `.then(setPanel)`) is treated as an updater callback, not the panel component.

| Preload trigger | When |
|-----------------|------|
| [`WarmPageIconPickerCacheEffect`](../../src/components/pages/warm-page-icon-picker-cache-effect.tsx) in [`AppProviders`](../../src/db/provider.tsx) | `scheduleIdleCallback` on every route — panel JS chunks only |
| Popover open | `ensurePanels` in `handleOpenChange` |
| Trigger `onPointerEnter` | Same `ensurePanels` |

Intent paths call [`ensurePageIconPickerReady`](../../src/lib/pages/preload-page-icon-picker.ts) (cached dynamic imports of both panel chunks plus `prefetchPageIconCatalogs`). Global warm calls [`warmPageIconPickerChunks`](../../src/lib/pages/preload-page-icon-picker.ts) only — no JSON on routes where the picker is never opened. Catalogs are self-hosted JSON parsed once and cached forever (`staleTime: Infinity`):

| Catalog | Asset | Query |
|---------|-------|-------|
| Emoji | `/emojibase/en/data.json` ([`PAGE_ICON_EMOJIBASE_URL`](../../src/lib/pages/page-icon-emojibase.ts); `pnpm sync:emojibase`) | [`emojiCatalogQueryOptions`](../../src/lib/pages/page-icon-emoji-catalog.ts) → `parseEmojiCatalog` |
| Tabler | `/tabler/icons.json` (`pnpm sync:icons`, `scripts/sync-tabler-icons-public.mjs` — all ~6,100 glyphs as `{ name, keywords, filled, node }`) | [`tablerIconCatalogQueryOptions`](../../src/lib/pages/page-icon-catalog.ts) |

[`PageIconDisplay`](../../src/components/pages/page-icon-display.tsx) resolves Tabler icons from SSR [`sidebarTablerGlyphs`](../../src/routes/__root.tsx) (`tablerIconNamesForSSR` — page sidebar icons plus `IconFile` / `IconInfoCircle` defaults) and, when needed, a by-name fetch via [`useTablerIconGlyph`](../../src/lib/pages/page-icon-catalog.ts) (`getSidebarTablerGlyphs` — no full catalog download). The full Tabler JSON is picker-only.

There is no clear/remove control: before the first pick the default file icon shows; afterward users swap emoji or Tabler icons only.

## Title editing

All pages show an inline-editable title in `PageWorkspace` (`PageTitleEditor`), including shipped server pages such as home. Title and slug metadata persist to `localPagesCollection` on each keystroke via [`persistPageMetadata`](../../src/lib/pages/persist-page-metadata.ts) (sidebar inline rename uses the same helper without `syncUrl`). Shipped server pages lazy-seed a local document on the first title or block edit. Home keeps slug `/` when the title changes; other pages replace the last path segment via [`buildSlugFromTitle`](../../src/lib/pages/build-page-tree.ts) with sibling dedupe among all siblings ([`dedupePageSegment`](../../src/lib/pages/build-page-tree.ts)). When the slug prefix changes, descendant metadata slugs cascade through [`replacePageSlugPrefix`](../../src/lib/pages/build-page-tree.ts). The browser URL updates on **blur** only: [`PageTitleEditor`](../../src/components/pages/page-title-editor.tsx) passes `syncUrl: true` to `persistPageMetadata` (user pages → `/p/…`, shipped → `/` or `/$`); sidebar rename calls `syncPageUrl` in `stopRenaming`. While the title field is focused, user pages keep a stable `/p/…` path even as the metadata slug updates. Other tabs for shipped pages still pick up slug changes via [`useSyncPageUrl`](../../src/hooks/use-sync-page-url.ts).

## Empty canvas

`normalizeEditablePageBlocks` ([`ensure-minimum-blocks.ts`](../../src/lib/blocks/ensure-minimum-blocks.ts), applied by `usePageCanvas`) guarantees every page can be edited immediately:

- Zero blocks → one normal empty `text` row.
- Last top-level row is not empty `text` → append one normal trailing empty `text` row so there is always a place to type at the bottom. Additional blank rows from Enter or gutter insert are kept as-is.
- Last top-level row is already empty `text` → no extra trailing row is added.

New blank rows use regular block ids and are persisted through the same full-order structural write path as gutter inserts when a content or structural edit needs them. New user pages are created with the first empty block persisted. Backspace/Delete on the sole empty row is a no-op so the page never returns to zero rows.

Canvas block order for a page is stored on the page metadata as `blockOrder`. Local page documents also store `createdAt` (immutable after insert) and `updatedAt`; see [local-first-persistence](./local-first-persistence.md). Structural canvas edits update that metadata in the same transaction as the page's local block rows; see [local-first-persistence](./local-first-persistence.md#ordering-invariant). Block types on the canvas (including checklist containers with `checklistItem` children, divider, and numbered lists) are documented in [block-model](./block-model.md) and [canvas-editor](./canvas-editor.md).

## Workspace layout

The page surface is `bg-sidebar`: [`SiteShell`](../../src/components/layout/site-shell.tsx) paints the whole window `bg-sidebar`/`text-sidebar-foreground`, and the sidebar panel ([`PageSidebar`](../../src/components/pages/page-sidebar.tsx)) shares that color so it sits flush on the surface (no separate column). On narrow viewports (`useIsNarrowViewport`, `(max-width: 767px)`) the shell switches to `bg-background`/`text-foreground` so content is full-bleed with no visible sidebar gutter. When collapsed, the hover peek overlay ([`PageSidebarHoverReveal`](../../src/components/pages/page-sidebar-hover-reveal.tsx)) uses main surface tokens (`bg-background`, accent/border) so it matches the inset card rather than the gutter. [`PageWorkspace`](../../src/components/pages/page-workspace.tsx) renders the main content as a floating **inset card** — `bg-background` with `border border-border md:rounded-xl` and outer `md:pt-2 md:pr-2` padding so the sidebar surface shows as a gutter around it. On narrow viewports the card border is removed (`max-md:border-0`) and the bottom author-toolbar host is hidden. The card holds a `flex-1` scroll body (`overflow-auto`, `px-12 py-12` on desktop, tighter `pl-8 pr-4 pb-4` on narrow viewports) that contains `PageTitleEditor` + `PageCanvas`. On desktop the [`PageHeader`](../../src/components/pages/page-header.tsx) is a fixed bar above that scroll body; on narrow viewports it is handed to `PageCanvas` as `headerSlot` and rendered inside the scroll body so the whole page (header included) scrolls. The header scrolls away by default, but when the page has a [cover image](#page-cover) the narrow header switches to a sticky + frosted (`backdrop-blur`) variant so it pins to the top with the cover sliding up behind it. The optional full-bleed cover renders above everything as `coverSlot`.

[`PageHeader`](../../src/components/pages/page-header.tsx) is a slim bar inside the inset card only (it never spans the sidebar; on mobile it scrolls with the canvas rather than staying fixed):

| Slot | Behavior |
|------|----------|
| Sidebar toggle (left) | Desktop: an expand button (`IconLayoutSidebar`, `usePageSidebarChrome().pinSidebar`) shows **only when collapsed** — when expanded the collapse control stays in the sidebar. Narrow viewport: [`SidebarTrigger`](../../src/components/ui/sidebar.tsx) opens the Sheet (`useIsNarrowViewport`, `(max-width: 767px)` — Tailwind `md:` parity) |
| Page actions (left, narrow viewport) | When dev mode, local changes, or stale state is active, [`PageCanvasActionsDrawer`](../../src/components/canvas/page-canvas-actions-drawer.tsx) portals an `IconTool` trigger into a mount slot between the sidebar toggle and breadcrumb; opens a bottom [`Drawer`](../../src/components/ui/drawer.tsx) with Save / Reset / stale actions (same logic as [`PageCanvasFooter`](../../src/components/canvas/page-canvas-footer.tsx)) |
| Page menu (right) | [`PageHeaderMenu`](../../src/components/pages/page-header-menu.tsx) (single ⋯ trigger): copy link, duplicate, delete, move, font/small-text settings, add/change [cover](#page-cover), activity panel, and conditional dev/sync actions |
| Breadcrumb (center) | Ancestor crumbs ([`PageBreadcrumbAncestorCrumb`](../../src/components/pages/page-breadcrumb-ancestor-crumb.tsx)): hover opens a [`DropdownMenu`](../../src/components/ui/dropdown-menu.tsx) sibling menu (`openOnHover` on trigger, `nativeButton={false}` + `render={<Link />}` so click still navigates) — siblings at that level via [`getSiblingPages`](../../src/lib/pages/breadcrumb-scope.ts), rows with children use [`DropdownMenuSub`](../../src/components/ui/dropdown-menu.tsx) / [`DropdownMenuSubTrigger`](../../src/components/ui/dropdown-menu.tsx) (hover opens nested submenu) for direct children (max 5 + `"N more"`); active branch highlighted via [`isPageOnActiveBranch`](../../src/lib/pages/breadcrumb-scope.ts) and `highlighted` on menu items. Current crumb ([`PageBreadcrumbCurrentCrumb`](../../src/components/pages/page-breadcrumb-current-crumb.tsx)): click opens a [`Popover`](../../src/components/ui/popover.tsx) with [`PageIconPicker`](../../src/components/pages/page-icon-picker.tsx) + title input (persists like canvas [`PageTitleEditor`](../../src/components/pages/page-title-editor.tsx); lazy-seeds via `titleSeed` from workspace). Live title/icon via `useLocalPageById`; page list from `useMergedPageListItems` |
| Favorite star (right) | `IconStar` / `IconStarFilled` ghost toggle; favorited page ids persist in the `site-page-favorites` cookie ([`page-favorites-cookie.ts`](../../src/lib/pages/page-favorites-cookie.ts)), read after mount to avoid hydration mismatch. Local-only, no schema change |

## Page list

[`PageWorkspace`](../../src/components/pages/page-workspace.tsx) renders a resizable page sidebar ([`PageSidebar`](../../src/components/pages/page-sidebar.tsx) inside [`PageSidebarChromeProvider`](../../src/components/pages/page-sidebar-chrome.tsx)) with [`PageList`](../../src/components/pages/page-list.tsx) uses [`useMergedPageListItems`](../../src/hooks/use-page-list.ts) ([`resolvePageCatalog`](../../src/lib/pages/resolve-page-state.ts)) for a single merged tree — shipped catalog union user pages minus tombstones. New shipped pages appear after deploy via [`pagesCatalogRevision`](../../src/lib/content/page-store.server.ts) + [`SyncPagesCatalogRevisionEffect`](../../src/components/pages/sync-pages-catalog-revision-effect.tsx). Pristine shipped rows always reflect bundled JSON; edited shipped rows stay local-first until **Reset to site version**. `PageListContent` flips `interactive` after hydration for drag state only.

Each row is a [`SidebarMenuButton`](../../src/components/ui/sidebar.tsx) (top-level and nested alike) with a custom `render` span for navigation; the row surface is draggable (home `slug: /` excluded). Drag preview uses [`DragOverlay`](../../src/components/dnd/drag-overlay.tsx) ([`setEmptyDragImage`](../../src/lib/dnd/drag-image.ts)) so the browser does not show the link URL. Drop lines align to the row content width at the row's depth indent (not full sidebar width). Drop targets and indicators use [`useDropTarget`](../../src/components/dnd/use-dnd.ts) on each [`PageListItem`](../../src/components/pages/page-list-item.tsx). See [Sidebar drag-and-drop](#sidebar-drag-and-drop), [drag-and-drop](./drag-and-drop.md), and [page-commands — `page.reposition`](../reference/page-commands.md#page-reposition).

Parent rows with children show a chevron on the row (`CollapsibleTrigger`) that rotates when open; expand/collapse uses `Collapsible` controlled by `expandedIds`. The row is a `data-reveal-group`: the page icon (`.swap-conceal`) and chevron (`.swap-reveal`) crossfade in one slot, and the three-dot action reveals via `.hover-reveal` (always visible on touch) — all through the shared hover-reveal primitive ([motion.md](./motion.md)). Row overflow uses [`SidebarMenuAction`](../../src/components/ui/sidebar.tsx) as a three-dot [`DropdownMenu`](../../src/components/ui/dropdown-menu.tsx) trigger ([`PageListRowDropdown`](../../src/components/pages/page-list-row-menu.tsx)): Rename, Change icon, Duplicate page, **Reset to site version** (lazy-seeded shipped pages only), Delete (disabled for home and when it would leave zero pages).

**Right-click** opens a context menu with the same actions:

| Action | Behavior |
|--------|----------|
| Duplicate page | Clones blocks (remapped ids) into a new sibling page titled `Copy of …` and navigates there |
| Rename | Inline title field; persists on each change via `persistPageMetadata` (lazy-seeds shipped pages like the canvas title) |
| Change icon | Opens the anchored `PageIconPicker` popover (lazy-seeds shipped pages like title/icon edits) |
| Reset to site version | `page.resetToRemote` — full restore of shipped title, icon, and blocks; hidden for user-created pages |
| Delete | Confirms, then `page.delete`; disabled for home (`/`) and when it would leave zero pages |

Deleting the active page navigates to the parent page (or home) via `resolveDeleteRedirectTarget` → `resolvePageNavTarget`.

## Page header menu

[`PageHeader`](../../src/components/pages/page-header.tsx) includes a horizontal **⋯** menu ([`PageHeaderMenu`](../../src/components/pages/page-header-menu.tsx)) on the right:

| Section | Actions |
|---------|---------|
| Search | Filters menu rows via [`ActionMenuSearchSection`](../../src/components/canvas/action-menu-search.tsx) |
| Settings | **Font** (Default / Serif / Mono), **Small text** toggle, and **Full width** toggle (desktop only) — persisted on [`localPageSchema`](../../src/lib/schemas/local-page.ts) (`font`, `smallText`, `fullWidth`) and shipped [`pageSchema`](../../src/lib/schemas/page.ts); typography via [`pageContentTypographyProps`](../../src/lib/pages/page-content-typography.ts); layout via [`pageContentColumnClassName`](../../src/lib/pages/page-content-layout.ts) |
| Cover | **Add cover** / **Change cover** opens [`PageCoverDialog`](../../src/components/pages/page-cover-menu.tsx) (Unsplash search / paste link / upload, plus reposition + remove for an existing cover) — see [Page cover](#page-cover) |
| Page actions | **Copy link** ([`buildPageLinkUrl`](../../src/lib/pages/copy-page-link.ts)), **Duplicate page**, **Version history** (full-view overlay on desktop / sub-drawer on touch), **Move to** (searchable parent picker → `page.reposition`; targets show each page's icon via [`PageIconDisplay`](../../src/components/pages/page-icon-display.tsx)), **Delete** (confirm dialog) — shared [`usePageActions`](../../src/hooks/use-page-actions.ts). The menu is grouped into divider-separated sections: display settings, page actions, mobile site-content actions, and the stats footer at the bottom. |
| Page stats | Footer rows: total blocks, total words, created at, last edited at ([`PageActivityPanel`](../../src/components/pages/page-activity-panel.tsx)) |

Dev/sync actions (**Save all**, **Reset page**, **Reset all**, **Refresh site content**) live in the site settings **Development** section ([`DevelopmentPanel`](../../src/components/settings/panels/development-panel.tsx)), opened from the bottom-right cog ([`SiteSettingsTrigger`](../../src/components/settings/site-settings-trigger.tsx)) on [`PageWorkspaceBody`](../../src/components/pages/page-workspace.tsx). See [site-settings](./site-settings.md).

### Page settings

Optional fields on page documents:

| Field | Values | Default |
|-------|--------|---------|
| `font` | `default` \| `serif` \| `mono` | Geist sans (omit field) |
| `smallText` | `boolean` | `false` (omit field) |
| `fullWidth` | `boolean` | `false` (omit field) — desktop only; mobile always full-bleed |
| `headerImage` | `{ source, src, alt?, credit?, focalY? }` ([`pageHeaderImageSchema`](../../src/lib/schemas/page-settings.ts)) | none (omit field) |

When `fullWidth` is off on desktop, the canvas title + blocks render in a centered **708px** column inside the scroll inset (`px-12`); a cover stays full-bleed regardless. Toggle on in the page header **⋯** menu (hidden on narrow viewports).

Writes go through [`persistPageSettings`](../../src/lib/pages/persist-page-settings.ts) (lazy-seeds shipped pages like title edits). Author **Save all** includes settings in exported JSON. `headerImage` also feeds [`hashPageMetadata`](../../src/lib/content/page-metadata-hash.ts) for stale detection and records a [`recordHeaderImageSettingActivity`](../../src/lib/pages/record-page-activity.ts) event.

### Page cover

An optional full-bleed **cover image** above the page title, modelled on the media block. The source reuses the media encoding (`source: "url" | "asset"`): uploads become content-addressed IndexedDB assets ([`putAsset`](../../src/db/assets/asset-store.ts)); pasted links and **Unsplash** photos are stored as hotlinks (`source: "url"`) and never re-hosted. Unsplash photos store the `raw` Imgix URL and are rendered CDN-sized on demand via `unsplashCdnUrl` (`?w=&q=80&auto=format&fit=crop` for `images.unsplash.com` only — [`unsplash.ts`](../../src/lib/media/unsplash.ts)).

The picker, render, and triggers are wired through a small [`PageCoverProvider`](../../src/components/pages/page-cover-context.tsx) (one shared [`PageCoverDialog`](../../src/components/pages/page-cover-menu.tsx)); `usePageCover().openPicker` is called from the page-header photo button ([`page-header.tsx`](../../src/components/pages/page-header.tsx), which prefetches the Unsplash default feed on hover), the ⋯ menu item, and the on-cover **Change** button. The picker presents as a centered dialog on desktop and a fixed-height bottom **drawer** on touch (`useResolvedMenuPresentation`, matching the icon picker), with Unsplash / Link / Upload tabs. The Unsplash panel ([`page-cover-unsplash-panel.tsx`](../../src/components/pages/page-cover-unsplash-panel.tsx)) is a [`ScrollArea`](../../src/components/ui/scroll-area.tsx) 2-column grid with an `InputGroup` search and **infinite scroll** (`useInfiniteQuery` + IntersectionObserver sentinel); it loads the popular editorial feed on open (empty query → `/api/unsplash/photos` feed) so default images show before typing, and shows photographer attribution as a muted link under each thumbnail. Unsplash search/download stay proxied through Nitro ([`/api/unsplash/search`](../../routes/api/unsplash/search.get.ts), [`/api/unsplash/download`](../../routes/api/unsplash/download.post.ts), registered in [`vite.config.ts`](../../vite.config.ts)) so `UNSPLASH_ACCESS_KEY` stays server-side; selecting a photo fires the required download ping and stores photographer `credit`.

[`PageCover`](../../src/components/pages/page-cover.tsx) renders inside the canvas scroll region as `coverSlot` — a direct child of the scroll root (above the centered content column, so it stays full-bleed even when the page is not full-width); full-bleed via negative margins **and** a `w-[calc(100%+padding)]` width in [`page-title-layout.ts`](../../src/lib/pages/page-title-layout.ts) so it spans under the overlay scrollbar. On desktop it shows a media-style hover toolbar ([`ButtonGroup variant="overlay"`]) — **Change / Reposition / Download / Copy / Copy link** (reusing [`media-actions.ts`](../../src/lib/media/media-actions.ts)) — plus a right-click menu. On touch the toolbar is hidden and a **long-press** opens the [`ContextMenu`](../../src/components/ui/context-menu.tsx) (which presents as a drawer) carrying the full action list including **Remove cover**. Covers are added/changed from the page-header **⋯** menu (there is no separate header photo button) or the on-cover **Change** action. **Reposition** is interactive on the image itself: the cover is `object-cover` (fit-to-width) and a vertical pointer drag pans `focalY` (`object-position`), reusing the document-listener + rAF drag pattern from [`useMediaResize`](../../src/components/blocks/types/media/use-media-resize.ts) (with an in-image **Done** affordance on touch). Photographer **attribution is shown only in the picker grid** (photos shown together), not on the rendered cover.

On narrow viewports a cover switches the [`PageHeader`](../../src/components/pages/page-header.tsx) slot to its sticky + `backdrop-blur` frosted variant (`pageCanvasMobileHeaderSlotStickyClassName`) so the cover scrolls up and reads as glass behind the pinned bar; cover-less pages keep the legacy scroll-away header. See [Workspace layout](#workspace-layout).

### Page stats

Inline footer at the bottom of the header menu ([`PageActivityPanel`](../../src/components/pages/page-activity-panel.tsx)): **Total blocks**, **Total words**, **Created at**, **Last edited at** — from [`buildPageActivitySummary`](../../src/lib/pages/page-activity-summary.ts) (block count, word count, `LocalPage.createdAt`, max of page/block `updatedAt`). Word count ([`page-word-count.ts`](../../src/lib/pages/page-word-count.ts)) sums primary-text blocks — including the `toggleHeading` title (the one container that carries primary text); other container shells (`columns`/`column`, `tabs`/`tab`, `table`/`tableRow`, list/checklist) contribute zero and their text children are counted directly.

IndexedDB event log ([`page-activity-store`](../../src/db/activity/page-activity-store.ts)) records edits for the settings **Analytics** charts; `block.updated` coalesced per block within 30s. Cleared on **Reset page**.

### Version history

The header menu's **Version history** is a submenu picker ([`PageVersionHistorySubmenu`](../../src/components/pages/page-version-history-submenu.tsx)) — a `DropdownMenuSub` (popover on desktop, sub-drawer on touch) listing the saved versions newest-first ([`usePageSnapshots`](../../src/db/queries/use-page-snapshots.ts)). Selecting one closes the menu and **takes over the page workspace** with a read-only render of that checkpoint, rather than an overlay: [`PageWorkspace`](../../src/components/pages/page-workspace.tsx) holds the selected descriptor (set via [`VersionPreviewProvider`](../../src/components/pages/version-preview-context.tsx) / `useVersionPreview`) and swaps the editor for [`PageVersionPreview`](../../src/components/pages/page-version-preview.tsx) — a header with **Exit** (returns to the live page) + **Restore this version** (confirm dialog) above [`SnapshotPreview`](../../src/components/pages/snapshot-preview.tsx). The preview is the canvas renderer in view mode, [`CanvasBlocksReadOnly`](../../src/components/canvas/page-canvas-server.tsx) `mode="view"` (read-only `View` components, no `contentEditable`/gutters) wrapped in the snapshot's [`pageContentTypographyProps`](../../src/lib/pages/page-content-typography.ts), with the payload loaded on demand by [`usePageSnapshotContent`](../../src/db/queries/use-page-snapshot-content.ts). Restore calls [`restorePageSnapshot`](../../src/lib/pages/restore-page-snapshot.ts) then remounts the live canvas.

Each edit schedules a debounced capture ([`schedulePageSnapshotCapture`](../../src/lib/pages/capture-page-snapshot.ts)) that collapses a **10-minute wall-clock window** into one checkpoint of the page's full state (blocks + order + title + icon + settings); content-hash dedupe skips no-op edits. Older history coarsens over time ([`thinSnapshotDescriptors`](../../src/lib/pages/thin-page-snapshots.ts): last 1h every 10-min bucket, then hourly/daily/weekly, hard-capped at 40/page). `restorePageSnapshot` re-applies the checkpoint's blocks atomically via `applyPageBlockDiff` plus the page metadata, then purges every checkpoint newer than the restored one (restoring rewinds the timeline). Storage layout and retention: [local-first-persistence — Page snapshots](./local-first-persistence.md#page-snapshots-version-history). Snapshots are cleared on **Reset page**, hard delete, **Reset all**, and **Save to source**.

## Slug rules

Metadata slugs are deduped among **all siblings** with the same `parentId` (shipped and user). Nested server pages are stored at nested paths under `content/pages/` matching their slug (for example `/previous-work/altitude` → `content/pages/previous-work/altitude.json`).

Home keeps slug `/` when the title changes — only the display title updates. Other pages replace the last path segment on rename with [`dedupePageSegment`](../../src/lib/pages/build-page-tree.ts). After a slug change, the splat route resolves edited server pages from `localPagesCollection` by slug or stable `page.id`. User page slugs are allocated with [`allocateUserPageSlug`](../../src/lib/pages/allocate-page-slug.ts).

## Route migration

`MigrateUserPageRoutesEffect` (mounted in [`AppProviders`](../../src/db/provider.tsx)) runs once per server + local catalog snapshot:

1. [`planUserPageSlugMigrations`](../../src/lib/pages/migrate-user-page-routes.ts) renames user pages whose metadata slug shadows a shipped path or duplicates another user slug (oldest user doc wins duplicate collisions).
2. Progress is stored in `localStorage` (`site-user-page-slugs-v1`) so the effect does not loop on the same snapshot.

There is no legacy redirect from old UUID-in-path routes (`/p/{pageId}`); migration only repairs metadata slugs. Navigation uses [`resolvePageNavTarget`](../../src/lib/pages/resolve-page-nav-target.ts) (`/$` or `/p/$` by `routeBy`). Sidebar drag preview: [drag-and-drop](./drag-and-drop.md).
