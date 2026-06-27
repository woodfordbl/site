# Canvas editor

## Command bus

```
UI → CanvasCommand → canvasReducer → CanvasEffect[] → applyCanvasEffects → TanStack DB
```

## Invariants

| Layer | May | Must not |
|-------|-----|----------|
| `*Edit` / `EditableSurface` | Emit commands | Cross-row policy |
| `canvasReducer` | All row/list/indent policy | React, localStorage |
| `usePageCanvas` | Lazy-seed + session-backed structural persist; reads `usePageBlocks` (live query) | Keyboard interpretation |
| `useCanvasRowActions` | Insert/move/paste placement | Content edits |

### Block identity on structural edits

Keep the **same block id** when converting or repositioning an existing row (bullet → text, list lift-out, Turn into, type changes that leave the row). Prefer reducer effects:

| Prefer | Avoid for same-id edits |
|--------|-------------------------|
| `persist` (update block fields / `parentId`) | `delete` + `insert` with the same id |
| `move` (reorder in `blockOrder`) | Recreating the row to change placement |

Delete + insert is for **new** rows (gutter insert, split remainder, new containers). Container lift-out uses [`planLiftContainerChildConversion`](../../src/lib/canvas/container-child-conversion.ts): `persist` the child as top-level text, delete the list container only when needed, `move` to document position, `focus` the same row id. `container.wrap` builds list/checklist shells via `buildWrappedContainerBlock` / `buildContainerChildBlock` in [`create-block.ts`](../../src/lib/blocks/create-block.ts) (normal block ids only; no sentinel suffixes). Enter at caret 0 inside a list/checklist child dispatches `block.liftAsText` when policy requires lift-out. Same-transaction deletes are tracked in block collection transactions (`deletedInTransaction`) so re-inserts use collection `insert`, not `update`.

## Session + persistence

[`CanvasPageSession`](../../src/lib/canvas/page-session.ts) mirrors the flat block array and row tree during edit. [`usePageCanvas`](../../src/db/queries/use-page-canvas.ts) hydrates the session from `usePageBlocks` and runs **`runBlockTransaction`** around each reducer dispatch: effects mutate the session, then **one** [`commitPageBlockTransaction`](../../src/db/queries/block-collection-ops.ts) writes incremental inserts/deletes/order patches (hot path) or [`applyPageBlockDiff`](../../src/db/queries/block-collection-ops.ts) (bulk paste/columns). There is no draft overlay — every keystroke writes through the same TanStack DB transaction path. While a transaction is open, `getPlacementRows` reads session rows so placement math matches in-flight mutations.

## Contexts and re-renders

[`canvas-editor-context.tsx`](../../src/components/canvas/canvas-editor-context.tsx) splits editor state by volatility so a keystroke does not invalidate every row: `CanvasEditorContext` holds identity-stable **actions** only (`CanvasEditorActions`, built in [`useCanvasEditor`](../../src/hooks/use-canvas-editor.ts); callbacks read live rows via `getRows()` instead of closing over them); volatile state lives in `CanvasSelectionContext`, `CanvasFocusContext`, and `CanvasEditorStateContext` (rows + clipboard, consumed only by menu surfaces). [`buildBlockTree`](../../src/lib/blocks/block-tree.ts) groups blocks by parent in one pass; `reconcileRowTrees` reuses unchanged row objects across rebuilds, so the memoized per-row components (`CanvasRowView`, `BlockTreeNode` — `React.memo`) bail out and a keystroke re-renders only the edited row.

## Row placement

Gutter +, drag-drop, and paste call `useCanvasRowActions` (`insertAfter`, `insertBefore`, `moveAfter`, `moveBefore`, `pasteAfter`). Placement resolves anchor row + edge in `src/lib/blocks/row-placement.ts`, then dispatches `row.insert` / `row.move` / `rows.paste`. The effect layer applies the placement to the current flat block array in `src/lib/blocks/page-block-mutations.ts`.

The resulting full array is the next document order. Hot structural edits persist through incremental ops inside one transaction per dispatch; bulk edits use `applyPageBlockDiff`, which writes both block rows and `localPagesCollection.blockOrder` atomically. Do not rely on localStorage/TanStack collection enumeration order for row order; reads must apply `blockOrder` before building the row tree.

## Focus

Reducer emits `focus` effects; [`useCanvasEditor`](../../src/hooks/use-canvas-editor.ts) applies them through `tryApplyCanvasFocus` in [`apply-pending-focus.ts`](../../src/lib/canvas/apply-pending-focus.ts). Effects may set `placement` (`start` / `end`) or an explicit caret `offset` (character index); when `offset` is set it wins over placement for the active field.

Focusable row navigation (Option+↑/↓, Shift+↑/↓ range, `row.focusAdjacent`, `row.moveAdjacent`) skips container shell rows and targets leaf rows only. Shared helpers live in [`focusable-rows.ts`](../../src/lib/canvas/focusable-rows.ts) (`flattenCanvasRows`, `findFocusableAdjacentRow`). `row.moveAdjacent` in the reducer resolves the neighbor then dispatches `row.move`.

When a row is lifted out of a list container, focus is deferred until the row renders at top level (`shouldDeferCanvasFocus` retries up to 16 animation frames).

## Slash menu

Schema-driven block items from `BLOCK_SPECS` in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts). Multi-variant blocks declare `slashItems` on the spec — Heading 1–4 (`headingLevel` on selection), bullet/numbered list (`listVariant`), 2/3/4 columns (`columnCount`), tabs (`tabCount`, default 2 via `tabs.create`); other specs derive one entry from `label` + `slashAliases` (including **Table**, default 3×3 via `table.create`). Page items come from [`src/lib/pages/page-slash-menu.ts`](../../src/lib/pages/page-slash-menu.ts) and [`src/lib/canvas/slash-menu-list.ts`](../../src/lib/canvas/slash-menu-list.ts): **New Page** (`page.create` with `navigate: false` + `slash.convert` to `pageLink` with `pageLinkVariant: "child"`) and **Link To Page** (`slash.convert` with `pageLinkVariant: "linked"` after picking a target in the inline search panel). Root list rows use editor-driven highlight (`selectedIndex` via `handleSlashMenuKeyDown` in [`EditableSurface`](../../src/components/editor/editable-surface.tsx)); the field stays focused while filtering `/query` (typing filters, arrow keys navigate, Enter confirms, Escape dismisses and leaves `/query` in the block without reopening until the leading `/` is removed). Focus moves into the link search field when picking a page; Escape returns to the root list. One canvas-level controller owns the menu: [`CanvasSlashProvider`](../../src/components/canvas/canvas-slash-context.tsx) keys the session by the row being typed in (container children included); edit surfaces wire up through `useRowSlash(rowId, enabled)` read by `useBlockFieldActions` — no slash props are threaded through `BlockTreeNode` or container views. The popover anchors to `document.activeElement` captured at slash input time (`initialFocus={false}`) and mounts in [`CanvasMenuRoot`](../../src/components/canvas/canvas-menu-root.tsx) (slash popover only). Slash open/payload state lives in [`canvas-menu-context.tsx`](../../src/components/canvas/canvas-menu-context.tsx) (`useCanvasMenu` / `useCanvasSlashSession`). Opening slash calls `closeBlockActionsMenu()` so only one overlay is active. Selection dispatches `slash.convert`, `container.wrap`, or page commands via `applyBlockConversion` ([`apply-block-conversion.ts`](../../src/lib/canvas/apply-block-conversion.ts)).

## Block rendering

| Layer | Role |
|-------|------|
| `BlockTreeNode` | Routes container vs leaf rows via `isContainerSpec` |
| `BlockRenderer` | Looks up `BLOCK_SPECS[block.type]`; renders `View` or `Edit` |
| `*View` / `*Edit` | Per-type UI under `src/components/blocks/types/`; `pageLink` rows show the target page icon via `PageIconDisplay` + `usePageSummary` |
| Container `Shell` | Registered as `Container` on the spec (e.g. list → `ListView`) |

Leaf edit components receive canvas keyboard wiring from `useBlockFieldActions` according to their `behavior.editStrategy`. Block and container specs live in [`registry.ts`](../../src/components/blocks/registry.ts); container helpers in [`block-container-config.ts`](../../src/lib/canvas/block-container-config.ts). See [block-types](./block-types.md).

## Device signals

Layout and canvas intentionally use **two axes** — do not merge them into one `isMobile` boolean or `(narrow OR coarse)`.

| Axis | Hook | Signal | Used for |
|------|------|--------|----------|
| Layout | [`useIsNarrowViewport`](../../src/hooks/device-layout.ts) | `(max-width: 767px)` — Tailwind `md:` parity | Sidebar Sheet, header slot, rail, inset spacing |
| Canvas | [`useIsCoarsePrimaryPointer`](../../src/hooks/device-layout.ts) | `(pointer: coarse)` | Long-press drawer, hide gutter, pointer DnD |

CSS `@media (hover: none)` in [`styles.css`](../../src/styles.css) covers touch-only affordances (hover-reveal, iOS callout suppression) — hover **capability**, not viewport width.

[`DeviceLayoutProvider`](../../src/components/layout/device-layout-provider.tsx) seeds both values from SSR hints, then reconciles to live `matchMedia` after mount (avoids hydration mismatch). Resolution order:

1. **Client-measured cookie** (`site-device-layout`, `{"nv":0|1,"cp":0|1}`) — authoritative on return visits; written by [`SyncDeviceLayoutCookieEffect`](../../src/components/layout/device-layout-provider.tsx).
2. **Server UA inference** — Bowser + optional Client Hints (`Sec-CH-UA-Mobile`, etc.) when no cookie yet ([`inferDeviceLayoutFromUserAgent`](../../src/lib/device/infer-device-layout-from-user-agent.ts)): mobile → both true; tablet → coarse only; desktop/unknown → both false. Bowser (MIT) over `ua-parser-js` (AGPL/commercial dual license).
3. **Live client truth** — `matchMedia` listeners update provider state + re-sync the cookie.

Edge cases: iPad gets desktop shell + touch canvas; narrow desktop windows SSR as desktop until client width corrects; DevTools must emulate viewport **and** pointer separately; Chromium Client Hints require opt-in headers on the response.

Constants: [`device-layout.constants.ts`](../../src/lib/device/device-layout.constants.ts). SSR loader: [`loadDeviceLayoutHints`](../../src/lib/device/load-device-layout-hints.ts) in [`__root.tsx`](../../src/routes/__root.tsx) `beforeLoad`. See also [local-first-persistence — SSR hint cookies](./local-first-persistence.md#ssr-hint-cookies).

## Mobile keyboard toolbar

On coarse primary pointers, [`MobileEditorToolbar`](../../src/components/canvas/mobile-editor-toolbar.tsx) pins a command bar (Add block, Turn into, indent, move, dismiss) above the on-screen keyboard while a block field is focused. Positioning is engine-split by [`useKeyboardToolbarAnchor`](../../src/hooks/use-visual-viewport-keyboard.ts): Chromium uses a CSS `bottom`-anchor (the layout viewport resizes for the keyboard), iOS Safari drives a composited `transform` from `visualViewport`. Page scroll can't pan the viewport (`site-shell` is `h-svh; overflow-hidden`; the canvas scroller has `overscroll-contain`), which is what keeps the bar jitter-free. Full rationale and browser-support matrix: [keyboard-toolbar](./keyboard-toolbar.md).

| Label | Block type |
|-------|------------|
| Heading 1–4 | `heading` (`props.level`: 1–4) |
| Text | `text` |
| Bullet list | `list` (`props.variant: bullet`) |
| Numbered list | `list` (`props.variant: ordered`) |
| Quote | `quote` |
| Callout | `callout` |
| Code | `code` (monospace editor with live Shiki highlighting; inline language picker) |
| Checklist | `checklist` |
| 2 / 3 / 4 columns | `columns` (`columns.create` with `count`) |
| Tabs | `tabs` (`tabs.create`, default 2; native [Base UI tabs](../../src/components/ui/tabs.tsx)) |
| Table | `table` (`table.create`, default 3×3) |
| Media | `media` (muted placeholder trigger → popover with Link \| Upload; local uploads in IndexedDB) |
| Embed | `embed` (muted placeholder trigger → link popover; YouTube/Vimeo iframe, direct image URL, or OG bookmark preview) |
| Divider | `divider` |

## Block selection

On fine pointers (mouse/trackpad), grab handles in the gutter expose block actions and multi-select. On coarse pointers (touch), the gutter is hidden — **long-press** row content (~450ms) opens the same actions in a bottom [`MobileBlockActionsDrawer`](../../src/components/canvas/mobile-block-actions-drawer.tsx) (Vaul). The gesture is handled by [`useBlockTouchGesture`](../../src/hooks/use-block-touch-gesture.ts), which suppresses iOS text selection while armed.

| Input | Action |
|-------|--------|
| Click grab (press and release without dragging) | Open block menu dropdown and highlight the row (desktop) |
| **Long-press row content** | Open block-actions drawer and highlight the row (touch) |
| Drag grab (mouse click-hold, or touch press-and-move on grip when shown) | Reorder row; no highlight and no menu |
| Shift+click grab or row content (field area) | Extend range from selection anchor, or from the row with the active caret if selection was cleared by editing; blurs the active field |
| Click empty space below block content, in a stretched column, or below the last page block (**overclick**) | Focus the nearest row (`focus.set`, caret at end — no block selection or menu) |
| Shift+↑ / Shift+↓ (focused block) | Same range extension as Shift+click, stepping one focusable row at a time |
| Option+↑ / Option+↓ (focused block) | Move the row before/after the adjacent focusable row (`row.moveAdjacent` → `row.move`) |
| Cmd/Ctrl+click grab | Toggle block in selection (unchanged) |
| Cmd/Ctrl+A | Select all rows |
| Delete / Backspace | `selection.delete` when blocks selected and field unfocused |
| Cmd/Ctrl+C | Copy selected blocks (plain text to system clipboard) |
| Cmd/Ctrl+V | `rows.paste` after last selected / focused row (via `paste` event) |
| Cmd/Ctrl+V with image/video in clipboard | Store each file as an asset and insert `media` blocks after the target row — works even while a text field is focused (e.g. pasting a screenshot) |
| Escape | Clear block selection |
| Click outside grab / menu | Clear block selection; block menu closes immediately |

**Block menu:** Turn into dispatches `slash.convert` or `container.wrap` (Heading 1–4, Text, Quote, Callout, Bullet list, Numbered list, Checklist, Divider). **Embed** blocks with a URL get top-level **Replace**, **Caption** (switch — editable caption below the preview), **Open in browser**, and **Copy link**, then Duplicate/Delete. Duplicate clones the row via `rows.paste`. Copy is keyboard-only (Cmd/Ctrl+C). Delete dispatches `row.delete`. Turn into is gated by `canTurnIntoBlock` (`text`, `heading`, `quote`, `callout`, `code` — `code` is `inline-custom` but carries primary text, so conversions preserve content). List and checklist containers: a plain grab click selects all child rows; Cmd/Ctrl+click toggles all children. A footer ([`BlockGutterMenuTimestamps`](../../src/components/canvas/block-gutter-menu/block-gutter-menu-timestamps.tsx)) shows the row's **Added** / **Last edited** times from its `LocalBlock` `createdAt` / `updatedAt` ([`useLocalBlockTimestamps`](../../src/db/queries/use-local-block-timestamps.ts)).

Each gutter composes [`BlockActionsMenu`](../../src/components/canvas/block-actions-menu.tsx) (provider tracks `openRowId`; trigger + [`BlockGutterMenu`](../../src/components/canvas/block-gutter-menu/block-gutter-menu.tsx) content colocated in [`BlockGutter`](../../src/components/canvas/block-gutter.tsx)). Touch reuses the same action handlers via [`useRowGutterHandlers`](../../src/components/canvas/use-row-gutter-handlers.ts) inside [`MobileBlockActionsDrawer`](../../src/components/canvas/mobile-block-actions-drawer.tsx). Base UI / Vaul handle dismiss; opening block actions calls `closeMenu()` on the slash provider so only one overlay is active at a time.

Text fields keep native copy/paste while focused, except that pasting image or video files is intercepted and rendered as `media` blocks ([`extractMediaFiles`](../../src/lib/media/paste-media.ts) in [`handleCanvasPasteEvent`](../../src/lib/canvas/canvas-keyboard-shortcuts.ts)). Block selection clears when editing starts; Shift+click on another row’s grab or field still ranges from the row being edited. Clicking outside the grab handle and menu portal clears selection. Overclick (empty space below block content, stretched column dead space, page bottom) is handled by [`useCanvasOverclick`](../../src/hooks/use-canvas-overclick.ts) with [`resolveOverclickRowFromPointer`](../../src/lib/canvas/resolve-overclick-row.ts). The block-actions menu closes immediately (no exit animation) when dismissed.

## Drag and drop

Grab-handle drag calls `moveAfter` / `moveBefore` (dispatches `row.move`). Drag start clears block selection so the source row is not highlighted during the move. Row id travels on a custom drag type (`application/x-canvas-row-id`), not `text/plain`, so editor fields do not show a text-insertion caret while hovering. Plumbing lives in the shared [drag-and-drop toolkit](./drag-and-drop.md) (`DndSurface` + `useDragSource` on the gutter). [`PageCanvasEditor`](../../src/components/canvas/page-canvas-editor.tsx) wraps the canvas in `DndSurface` + [`CanvasRowDndBridge`](../../src/components/dnd/canvas-row-dnd-bridge.tsx) so nested table column surfaces can still bind row drags to the canvas channel (`useCanvasRowSurface`). While dragging:

- A native drag image clones `[data-canvas-row-content]` via [`setClonedDragImage`](../../src/lib/dnd/drag-image.ts) (`native-clone` on [`PageCanvasEditor`](../../src/components/canvas/page-canvas-editor.tsx)). On touch (where native DnD never starts) the same content is cloned into a React overlay preview ([`CanvasRowDragPreview`](../../src/components/dnd/canvas-row-drag-preview.tsx)) instead — see [drag-and-drop — Touch drags](./drag-and-drop.md#touch-pointer-drags).
- [`CanvasDropZone`](../../src/components/canvas/page-canvas-editor.tsx) (`useDropZone`) resolves the insertion target from pointer position via [`resolveDropTargetFromPointer`](../../src/lib/canvas/resolve-drop-target.ts) (row rects from `[data-canvas-row-id]` cached by the surface). The same resolver runs on each batched `dragover` and on `drop` so the line and committed move always match.
- Drop targets show a single `--selection` insertion line before/after the resolved row ([`normalizeDropTarget`](../../src/lib/canvas/drop-target.ts) dedupes adjacent edges). Nested list rows win over their parent container when rects overlap (deepest row first). Empty **column** shells accept drops via `row.moveToPosition` with `atScopeStart`; horizontal pointer position resolves across `[data-column-id]` regions inside `[data-columns-layout]`. **Table** body rows reorder via [`resolveTableLayoutDrop`](../../src/lib/canvas/resolve-table-drop-target.ts) and [`TableRowHandle`](../../src/components/blocks/types/table/table-row-handle.tsx) (`useCanvasRowSurface`); column reorder uses a nested `TableColumnDnD` surface inside [`TableView`](../../src/components/blocks/types/table/table-view.tsx) — see [table-blocks](./table-blocks.md#structure-handles). Trailing plus controls use a separate pointer scrub (not HTML5 DnD) — [table-blocks — Trailing plus controls](./table-blocks.md#trailing-plus-controls).
- When the pointer is above the first top-level row or below the last top-level row (including the empty space below the block list), the target snaps to the beginning or end of the page row list.
- Editor fields ignore pointer events until the drag ends.

## Keyboard

| Key | Action |
|-----|--------|
| ↑ / ↓ (focused field, caret at boundary) | `row.focusAdjacent` |
| Option+↑ / Option+↓ (focused field) | `row.moveAdjacent` (reorder before/after focusable neighbor) |
| Shift+↑ / Shift+↓ (focused field) | Extend block selection to the focusable neighbor (blurs field; same anchor rules as Shift+click) |
| Tab | `indent.adjust` |
| Enter | `row.split` at caret (text after caret → new block of same type); at end of row → empty `text` block after; at caret 0 on non-empty row → empty row before (always `text` for headings; same type otherwise), focus stays on original row; **list child at caret 0** lifts out as top-level `text` (empty or not) |
| Shift+Enter | Newline in multiline `text` / `quote` / `callout` fields (`field-sizing-content`); list exit uses Enter/Backspace structural paths, not Shift+Enter |
| Backspace/Delete | `resolveStructuralAction` (sole empty top-level row is kept; empty list item with previous sibling → `row.delete` + focus previous; first or sole empty list item → `block.liftAsText`, sole item replaces the list row) |

### Markdown shortcuts

At the start of an empty inline-text block, type a prefix then **Space** to convert the row (same command path as slash menu / turn into). The prefix is stripped; focus stays at block start.

| Prefix + Space | Converts to |
|----------------|-------------|
| `#` | Heading 1 |
| `##` | Heading 2 |
| `###` | Heading 3 |
| `####` | Heading 4 |
| `-` | Bullet list |
| `1.` | Numbered list |
| `[]` | Checklist |
| `---` | Divider |

Heading, list, checklist, and divider shortcuts apply on top-level canvas rows only. Matcher: [`src/lib/canvas/markdown-shortcuts.ts`](../../src/lib/canvas/markdown-shortcuts.ts).

### List items

List items are plain **text** only (no headings, quotes, or page links inside bullets). Converting a list item to another block type (Turn into, slash menu, or markdown) follows container policy: text-to-text stays in the list; disallowed targets lift the item out and insert it at that canvas position; middle items split the list into head + converted block + tail. The shared child renderer lives in [`ContainerChildren`](../../src/components/blocks/container-children.tsx), while marker UI stays in [`ListView`](../../src/components/blocks/types/list/list-view.tsx). List keyboard policy: [`structural-actions`](../reference/structural-actions.md).

### Checklist items

Checklist items are **`checklistItem`** blocks with `props.text` and `props.checked`. Each row renders a ShadCN checkbox (toggle in edit mode; read-only in view) beside an inline text field. Enter, Backspace, and Turn into follow the same container lift/split policy as list items. The shell lives in [`ChecklistView`](../../src/components/blocks/types/checklist/checklist-view.tsx).

## Minimum and trailing rows

Editable canvases keep a normal empty `text` row available through `normalizeEditablePageBlocks`:

- **Minimum row** — zero blocks get one empty `text` row with a normal block id.
- **Trailing row** — when the last top-level block is not empty `text`, append one normal empty `text` row at the end. User-created blank rows beyond that are preserved.

When a structural edit needs a new trailing blank, the session's `ensureTrailingBlank` inserts it inside the same block transaction as the edit, so `blockOrder` includes the blank row like any other row. See [pages](./pages.md#empty-canvas).

## Render pipeline (flash-free)

[`PageCanvas`](../../src/components/canvas/page-canvas.tsx) chooses what to render so a dirty refresh never shows the static server frame: SSR + the first client render emit `PageCanvasServer` (matches the SSR HTML); a `useLayoutEffect` (pre-paint) swaps dirty pages to [`PageCanvasLocalView`](../../src/components/canvas/page-canvas-local-view.tsx) (synchronous localStorage read in the **main bundle**, not the editor chunk); then the lazily-imported [`PageCanvasEditor`](../../src/components/canvas/page-canvas-editor.tsx) replaces it with identical markup. All three reuse the shared `CanvasBlocksReadOnly` / editor body layout, so the swaps cause no layout shift. See [local-first-persistence — Flash-free render swap](./local-first-persistence.md#ssr-dirty-cookie). `CanvasBlocksReadOnly` takes an optional `mode` (default `"edit"` for that layout-parity swap); the [version-history preview](./pages.md#version-history) passes `mode="view"` to render the same body genuinely read-only (each block's `View` component — no `contentEditable`, no gutters).

## Page footer

`PageCanvas` owns the scroll region: the page title (`titleSlot`) and block list scroll full-height inside the inset card. On desktop the [`PageHeader`](../../src/components/pages/page-header.tsx) breadcrumb is a fixed bar above the scroll region; on narrow viewports it is passed as `headerSlot` and rendered **inside** the scroll region so it scrolls away with the content (nothing pinned to the top). The scroll region also tightens its padding on narrow viewports (`pl-8 pr-4 pb-4`, narrower than the desktop `px-12 py-12`) and the gutter grip shrinks to match (`w-8` vs `w-12`) so blocks get more usable width. The author toolbar ([`PageCanvasFooter`](../../src/components/canvas/page-canvas-footer.tsx)) is rendered at **workspace level** ([`page-workspace.tsx`](../../src/components/pages/page-workspace.tsx)), decoupled from the lazily-loaded editor chunk so it is always present — not an in-flow footer. On desktop it sits in a strip below the inset card on the `bg-sidebar` surface; on narrow viewports that host is hidden and the same actions surface via [`PageCanvasActionsDrawer`](../../src/components/canvas/page-canvas-actions-drawer.tsx) from a trigger in the scrolling `PageHeader`. All actions are global (no editor state):

| Button | When | Action |
|--------|------|--------|
| **Refresh site content** | An overridden page's shipped content changed ([`useSiteContentUpdates`](../../src/hooks/use-site-content-updates.ts)) | Confirms, then `refreshSiteContent` resets only content-stale overridden pages |
| **Save all** | `import.meta.env.DEV` | Confirms, then `saveAllLocalPages` writes every locally-edited page to `content/pages/**.json` and clears local |
| **Reset page** | Local page document exists | Confirms, then `resetPageToRemote(pageId)` — discards this page's localStorage overrides |
| **Reset all** | Local page document exists | Confirms, then `page.resetAllToRemote` — clears all local state, navigates home |

After any of these clears local state for the open page, the workspace bumps a canvas remount key so it re-reads fresh data without a flash. See [author-dev-mode](./author-dev-mode.md) for the save workflow.

## Page routes

Shipped and lazy-seeded pages load through [`src/routes/$.tsx`](../../src/routes/$.tsx) (`/` or `/$` splat) so multi-segment slugs such as `/work/projects` resolve server JSON. User-created pages load on [`src/routes/p.$.tsx`](../../src/routes/p.$.tsx) (`/p/$` metadata slug splat, e.g. `/p/notes` — not `/p/{pageId}`); [`useResolvedUserPage`](../../src/hooks/use-resolved-page.ts) uses [`resolveActiveUserPageBySlug`](../../src/lib/pages/resolve-user-page-by-slug.ts) so delete tombstones with the same slug do not block the route. Hitting `/$` for a user-only slug briefly mounts [`UserSlugPageClient`](../../src/routes/$.tsx), then `replace`-redirects to `/p/…`. [`useMigrateUserPageRoutes`](../../src/hooks/use-migrate-user-page-routes.ts) (via [`MigrateUserPageRoutesEffect`](../../src/components/pages/migrate-user-page-routes-effect.tsx) in `AppProviders`) repairs shadowed or duplicate user metadata slugs only (`site-user-page-slugs-v1`) — [pages — Route migration](./pages.md#route-migration). Shipped-page passive tabs pick up slug renames through [`useSyncPageUrl`](../../src/hooks/use-sync-page-url.ts) (`/$` paths only). Active-tab title renames call [`syncPageUrl`](../../src/lib/pages/sync-url.ts) on blur with `{ userPage: true }` when `routeBy === "id"`; user pages keep a stable `/p/…` URL while the title field is focused.

## Page effects

Page lifecycle commands (`PageCommand` in [`commands.ts`](../../src/lib/canvas/commands.ts)) map to the **`PageEffect`** union in [`effects.ts`](../../src/lib/canvas/effects.ts) via [`pageReducer`](../../src/hooks/use-page-dispatch.ts); [`usePageDispatch`](../../src/hooks/use-page-dispatch.ts) applies them to `localPagesCollection` and the router. Canvas block edits use **`CanvasEffect`** only (same file).

| Effect | Role |
|--------|------|
| `page.persist` | Insert or update page metadata (`create: true` runs [`purgeSlugTombstonesForUserPageCreate`](../../src/lib/pages/resolve-user-page-by-slug.ts), then seeds `initialBlocks` into `localBlocksCollection`); title/slug renames cascade descendant prefixes; `syncPageUrl` only when `persistPageMetadata` is called with `syncUrl: true` (title blur) or from `persistPageReposition` |
| `page.delete` | Hard-delete user pages or tombstone shipped pages locally |
| `page.reposition` | Sidebar DnD: [`planPageReposition`](../../src/lib/pages/reposition-page.ts) → [`persistPageReposition`](../../src/lib/pages/persist-page-reposition.ts); optional `seed` / `parentSeed` ([`PageMetadataSeed`](../../src/lib/pages/persist-page-metadata.ts)); optional [`appendChildPageLinkFromShard`](../../src/lib/pages/append-page-link-on-parent.ts) on nest drops |
| `navigate` | `{ slug, mode?: "router" \| "history", userPage?: boolean }` — default `router` uses TanStack Router with [`pageNavTargetForUserPage`](../../src/lib/pages/slugify.ts) when `userPage` (new user pages → `/p/{slug}`), else [`pageNavTarget`](../../src/lib/pages/slugify.ts) (`replace: true`); `history` calls [`syncPageUrl`](../../src/lib/pages/sync-url.ts) with the same `userPage` flag |

`page.create` emits `page.persist` plus `navigate` with `userPage: true` unless `navigate: false` (slash **New Page**). `page.update` emits `page.persist` only. `page.reposition` is emitted only from sidebar drops — not from `canvasReducer`.

## Sidebar page list

The workspace [`PageSidebar`](../../src/components/pages/page-sidebar.tsx) renders [`PageList`](../../src/components/pages/page-list.tsx): a nested tree from `buildPageTree` (not canvas rows). Rows are ghost navigation links with whole-row HTML5 drag-and-drop (click-vs-drag shared with the canvas gutter), chevron expand for children, and a right-click context menu (duplicate, inline rename, delete). Home (`slug: /`) is not draggable. See [drag-and-drop](./drag-and-drop.md) for shared toolkit wiring and the surface table below.

| Surface | Drag target | Drag preview | Resolver |
|---------|-------------|--------------|----------|
| Canvas blocks | `[data-canvas-row-id]` rows | [`setClonedDragImage`](../../src/lib/dnd/drag-image.ts) on row content | [`resolveDropTargetFromPointer`](../../src/lib/canvas/resolve-drop-target.ts) — before/after half-row edges |
| Sidebar pages | `[data-page-list-row-id]` row chrome | [`setEmptyDragImage`](../../src/lib/dnd/drag-image.ts) + [`DragOverlay`](../../src/components/dnd/drag-overlay.tsx) / [`PageListDragPreview`](../../src/components/pages/page-list-drag-preview.tsx) | [`resolve-page-list-drop-target.ts`](../../src/lib/pages/resolve-page-list-drop-target.ts) — top/middle/bottom bands (sibling vs nest) + horizontal unnest |

Sidebar drops dispatch **`page.reposition`** via [`usePageDispatch`](../../src/hooks/use-page-dispatch.ts) (`pageReducer` → `page.reposition` effect), not `CanvasCommand`. [`PageListLive`](../../src/components/pages/page-list.tsx) wraps the tree in [`DndSurface`](../../src/components/dnd/dnd-surface.tsx); the list `<nav>` spreads `useDropZone` props. Rects come from [`collectRects`](../../src/lib/dnd/rects.ts) on `[data-page-list-row-id]`. Failed planning returns no effects. Nest drops can append a child `pageLink` on the parent page’s canvas; between-row drops update `parentId` and `sidebarOrder` only. Visible rows respect `expandedIds` via [`flattenVisiblePageRows`](../../src/lib/pages/flatten-visible-page-rows.ts). Row indent updates only after drop. Full UX: [pages — Sidebar drag-and-drop](./pages.md#sidebar-drag-and-drop) and [page-commands — `page.reposition`](../reference/page-commands.md#page-reposition).
