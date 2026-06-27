# Canvas commands

Block UI dispatches these via `useBlockFieldActions` / `BlockRenderer` (canvas context) or slash menu. The slash menu root list is built by [`buildRootSlashMenuItems`](../../src/lib/canvas/slash-menu-list.ts) and rendered as plain command rows in a field-anchored Popover (editor-driven selection at root; inline search panel for page link targets). Escape or outside dismiss suppresses reopen until the leading `/` is removed from the block text. Persisted block rows update `localBlocksCollection` immediately on content edits; structural commands run inside one block transaction per dispatch — incremental inserts/deletes/order patches committed by `commitPageBlockTransaction` (the hot path, driven from [`use-page-canvas.ts`](../../src/db/queries/use-page-canvas.ts)), with `applyPageBlockDiff` for bulk edits — keeping `localPagesCollection.blockOrder` in sync. Block types register in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts); container policy in [`src/lib/canvas/block-container-config.ts`](../../src/lib/canvas/block-container-config.ts). The canvas scroll region also renders non-command passive slots above the row list — the optional [page cover](../architecture/pages.md#page-cover) and the mobile header — which carry no commands.

## Row lifecycle

| Command | Trigger |
|---------|---------|
| `row.update` | Field onChange; embed caption edits and **Caption** switch (`showCaption`) |
| `row.insert` | Gutter + — position `{ parentId, anchorRowId, edge }` or `{ parentId, atScopeStart }`; optional `pageId` + `pageLinkVariant` build a `pageLink` (sidebar page dropped into the canvas) |
| `row.split` | Enter in text block at caret (text after caret → new block of same type); at end of row → empty `text` block after; at caret 0 on non-empty top-level row → empty row before (same type), focus stays on original row; on empty top-level row → empty `text` row after; **list child at caret 0** lifts out as top-level `text` (empty or not; splits list when needed) |
| `row.delete` | Structural resolver; gutter menu **Delete** |
| `row.convert` | Slash selection; gutter menu **Turn into**. Container children stay inside only when container policy allows the target; list items stay in the list only for `text → text`; other targets lift the item out and split the list when needed. `pageLink` conversions pass `options.pageId` and optional `options.pageLinkVariant` (`linked` \| `child`). |
| `row.move` | Drag block to new position (grab handle), or Option+↑/↓ on a focused row (`row.moveAdjacent`). `PageCanvasEditor` resolves drag targets from pointer Y via `resolveDropTargetFromPointer`; off-page pointer snaps to first/last top-level row. Touch grips commit the same command via the pointer-drag path (the resolver's pointer X is nudged into the content column since the finger grabs the left gutter) — see [drag-and-drop — Touch drags](../architecture/drag-and-drop.md#touch-pointer-drags). |
| `selection.delete` | Delete selected blocks (Delete / Backspace) |
| `rows.paste` | Paste copied blocks after selection or focus; gutter menu **Duplicate**. Always clones with fresh ids — `cloneBlocksForPaste` ([`clipboard.ts`](../../src/lib/canvas/clipboard.ts)) remaps `parentId` within the pasted set so container subtrees stay intact; subtree roots are coerced to types the destination accepts (`coercePastedRootBlock` in [`reducer.ts`](../../src/lib/canvas/reducer.ts)) |

## Row actions hook

Gutter, drag-drop, and paste use `useCanvasRowActions` (via canvas editor context):

| Method | Dispatches |
|--------|------------|
| `insertAfter` / `insertBefore` | `row.insert` |
| `insertAtScopeStart` | `row.insert` at scope index 0 |
| `moveAfter` / `moveBefore` | `row.move` |
| `pasteAfter` / `pasteBefore` | `rows.paste` |

Placement math lives in `src/lib/blocks/row-placement.ts`. Drag target resolution lives in `src/lib/canvas/resolve-drop-target.ts` and `src/lib/canvas/drop-target.ts` (`normalizeDropTarget`, `resolveDropTargetFromPointer`, `collectCanvasRowRects`).

Structural row commands must persist the full next document order, not only the changed block row. The block transaction patches `blockOrder` alongside the block row mutations (`patchBlockOrder` / `commitPageBlockTransaction` in [`block-collection-ops.ts`](../../src/db/queries/block-collection-ops.ts)) so order stays in sync with the local block shard.

## Structural

| Command | Meaning |
|---------|---------|
| `indent.adjust` | Tab / Shift+Tab / outdent at caret 0 |
| `block.mergeTextIntoPreviousSibling` | Join text with previous sibling |
| `block.mergeIntoPreviousCanvasRow` | Empty ¶ after a container that accepts empty merge → last child |
| `block.liftAsText` | Exit container child as text block (indent preserved; sole child deletes the container; empty list first item with no previous sibling) |
| `container.wrap` | Wrap row in list (`variant`: `bullet` or `ordered`) or checklist using `buildWrappedContainerBlock` / `buildContainerChildBlock`. Container children lift out first, then wrap at that canvas position (no nested containers). |
| `container.unwrap` | Collapse empty container (empty list first or sole item uses `block.liftAsText`; empty list item with previous sibling uses `row.delete`) |
| `columns.create` | Replace the active row with a `columns` shell and `count` (2–4) `column` children, each seeded with one `text` row (first column keeps slash text). Planner: [`planColumnsCreate`](../../src/lib/canvas/columns-layout.ts). |
| `columns.addColumn` | Append a `column` + empty `text` (max 4); equalize `column.props.width`. |
| `columns.removeColumn` | Delete a column subtree; when fewer than 2 columns remain, [`planColumnsUnwrap`](../../src/lib/canvas/columns-layout.ts) hoists content to the canvas parent. |
| `tabs.create` | Replace the active row with a `tabs` shell and `count` `tab` children (labelled `Tab 1…N`), each seeded with one `text` row (first tab keeps slash text). Planner: [`planTabsCreate`](../../src/lib/canvas/tabs-layout.ts). |
| `tabs.addTab` | Append a `tab` + empty `text` (max 8), labelled by current tab count. |
| `tabs.removeTab` | Delete a tab subtree; removing the last tab (`MIN_TABS_COUNT` 1) calls [`planTabsUnwrap`](../../src/lib/canvas/tabs-layout.ts) to dissolve the block. Tab renames, the optional tab icon (`tab.props.icon`), and the author's default tab (`tabs.props.defaultTabId`) persist via the generic `row.update`. |
| `tabs.moveTab` | Reorder a tab one slot toward the start (`prev`) or end (`next`) among its siblings; no-op at the ends. Planner: [`planTabsMoveTab`](../../src/lib/canvas/tabs-layout.ts). |
| `table.create` | Replace the active row with a `table` shell, `rows` × `columns` grid of `tableRow` / `tableCell`, optional `hasHeaderRow`, seed first cell from slash text. Planner: [`planTableCreate`](../../src/lib/canvas/table-layout.ts). |
| `table.addRow` | Insert a `tableRow` with empty cells matching sibling column count; anchor `tableRowId` + optional `edge` (`before` \| `after`). Optional `focus` (default `true`); trailing plus scrub passes `focus: false` on intermediate adds. Structure-handle menu, hover add-row control, and trailing plus scrub. |
| `table.addColumn` | Insert empty `tableCell` at `columnIndex` + `edge` in every row; extend `table.props.columnWidths`. Optional `focus` (default `true`); trailing plus scrub passes `focus: false` on intermediate adds. |
| `table.removeRow` | Delete row when `> MIN_TABLE_ROWS`; removing header row clears `hasHeaderRow`. |
| `table.removeColumn` | Delete index-th cell in all rows; splice `columnWidths` (min 2 columns). |
| `table.duplicateColumn` | Clone cell text in every row; insert duplicate column after `columnIndex`. Planner: [`planTableDuplicateColumn`](../../src/lib/canvas/table-layout.ts). |
| `table.reorderColumn` | Batch `move` each row's cell + reorder `columnWidths` (`tableId`, `fromIndex`, `toIndex`). |
| `table.toggleHeaderRow` | `persist` `hasHeaderRow` on the table block. |
| `table.toggleHeaderColumn` | `persist` `hasHeaderColumn` on the table block. |
| `table.fitToWidth` | Proportionally scale `columnWidths` to `targetWidthPx` (block menu measures scroll viewport). |
| `table.updateColumnWidths` | Commit column resize (`columnWidths[]`). |
| `table.focusCell` | Tab/Enter grid navigation (`direction`: `next` \| `previous` \| `down`). |
| `row.moveToPosition` | Move a row to an explicit `RowPlacement` (used for empty-column drops with `atScopeStart`). |

## Page stale (seeded server pages)

| Command | Meaning |
|---------|---------|
| `page.revertToServer` | Replace local page blocks with server JSON |
| `page.acknowledgeServerBaseline` | Keep local blocks, refresh `serverBaselineHash` |

## Focus

| Command | Meaning |
|---------|---------|
| `focus.set` | Focus row (`placement`: `start`/`end`, or explicit `offset` character index). Optional `embedAction`: `replace` opens the embed URL picker; `caption` focuses the caption field. |
| `row.focusAdjacent` | Up/down navigation at caret boundary (skips container shells; [`focusable-rows.ts`](../../src/lib/canvas/focusable-rows.ts)) |
| `row.moveAdjacent` | Option+↑/↓ — reducer finds adjacent focusable row, then dispatches `row.move` before/after it |

Reducer `focus` effects mirror `focus.set` (`placement` and/or `offset`). `apply-pending-focus` uses `offset` when present so merge/lift paths restore the caret after structural edits.

Focus effects are applied in `useCanvasEditor` via `tryApplyCanvasFocus` ([`apply-pending-focus.ts`](../../src/lib/canvas/apply-pending-focus.ts)). List lift-out defers focus until the row is no longer rendered under its former container row.

## Gutter block menu

Press and release the grab handle (without dragging) highlights the row and opens the per-gutter block-actions dropdown ([`BlockActionsMenu`](../../src/components/canvas/block-actions-menu.tsx) in [`BlockGutter`](../../src/components/canvas/block-gutter.tsx)). When [`useIsCoarsePrimaryPointer`](../../src/hooks/device-layout.ts) is true (`(pointer: coarse)`), the gutter is not rendered — **long-press** row content opens the same menu in [`MobileBlockActionsDrawer`](../../src/components/canvas/mobile-block-actions-drawer.tsx) (Vaul). See [canvas-editor — Device signals](../architecture/canvas-editor.md#device-signals). Shift+click on the grab or row content extends a range from the selection anchor or the row with the active caret (via `getActiveCanvasRowId`); it blurs the field and does not open the menu. Cmd/Ctrl+click on the grab toggles selection (unchanged). Click-hold drag reorders with no highlight or menu. Base UI / Vaul dismisses the menu on outside interaction (no close animation). Menu actions use existing commands:

| Menu item | Dispatches / hook |
|-----------|-------------------|
| Turn into | `slash.convert` or `container.wrap` (inline-text blocks only) |
| Duplicate | `rows.paste` via `duplicateRow` (dispatches the row's flattened subtree; paste clones it with fresh ids) |
| Delete | `row.delete` |

Open state is tracked by [`BlockActionsMenuProvider`](../../src/components/canvas/block-actions-menu.tsx) (`openRowId`). Keyboard delete with a menu open closes it first via `useCloseBlockActionsMenuBeforeAction` before dispatching `row.delete` / `selection.delete`. (row/column handles in [`TableView`](../../src/components/blocks/types/table/table-view.tsx)) dispatch table-scoped commands directly — not the gutter block menu:

| Menu item | Dispatches |
|-----------|------------|
| Insert above / below (row) or left / right (column) | `table.addRow` / `table.addColumn` with `edge` |
| Duplicate | `rows.paste` via `duplicateRow` (row) or `table.duplicateColumn` (column) |
| Clear contents | `row.update` (empty cell text in scope) |
| Delete | `table.removeRow` / `table.removeColumn` |

Copy is keyboard-only: Cmd/Ctrl+C copies selected rows to the canvas clipboard (`copySelection` / `copyRow`), not a gutter menu item. Both capture full subtrees — `subtreeBlocksFromSelectedRows` ([`block-selection.ts`](../../src/lib/canvas/block-selection.ts)) for selections, `flattenRows` for a single row.

Pasting image/video files (e.g. a screenshot) is intercepted in [`handleCanvasPasteEvent`](../../src/lib/canvas/canvas-keyboard-shortcuts.ts) before the field-focus guard: `extractMediaFiles` ([`paste-media.ts`](../../src/lib/media/paste-media.ts)) pulls the files, `insertMediaFiles` stores each as an IndexedDB asset and inserts `media` blocks via `rows.paste` after the target row — so it works even while a text field is focused. Non-media paste falls through to the block-clipboard path above.

Conversion helper: `src/lib/canvas/apply-block-conversion.ts`. Paste cloning: `cloneBlocksForPaste` in `src/lib/canvas/clipboard.ts`.

## Slash

| Command | Meaning |
|---------|---------|
| `slash.convert` | Convert block type (Heading 1–4, Text, Bullet list, Numbered list, Checklist, Quote, Page link, Media, Embed, Divider). Container children lift out unless the container allows the target. Heading selections pass `headingLevel` (1–4). List selections use `container.wrap` with `listVariant`. Checklist selections use `container.wrap` with `containerType: checklist`. Page link selections pass `pageId` and optional `pageLinkVariant`: `linked` (**Link To Page**) or `child` (**New Page**). |

## Author (dev only)

No author commands exist on `CanvasCommand`; the dev-only footer calls helpers directly:

| UI | Meaning |
|---------|---------|
| Footer **Save to source** | Calls `preparePageDocumentForAuthorSave` (exports IndexedDB media to `public/media/` when needed), `saveMediaAssets`, then `savePage` + `exportPageDocument` from `PageCanvasFooter` (dev only); exports optional page `icon` when set |
| Footer **Reset** | Discards local page document via `resetToServer` |

Author save exports `parentId` with the page document so nested JSON paths round-trip correctly. Normal blank rows are exported like any other user row.

## Render invariants

`normalizeEditablePageBlocks` runs before the editor builds rows. Pages always have at least one block and at least one trailing empty top-level `text` row when the last stored row is not already blank. Blank rows use normal block ids and are persisted through the same full-order structural write path as inserted rows. See [pages](../architecture/pages.md#empty-canvas).

## Page commands

Page lifecycle and sidebar tree edits use **`PageCommand`** / **`PageEffect`** in [`commands.ts`](../../src/lib/canvas/commands.ts), [`effects.ts`](../../src/lib/canvas/effects.ts), and [`usePageDispatch`](../../src/hooks/use-page-dispatch.ts) — not `canvasReducer`. Full reference: [`page-commands.md`](./page-commands.md).

| Command | Role |
|---------|------|
| `page.create` | New user page; `page.persist` (purges same-scope slug tombstones, then insert) + `navigate` (`userPage: true` → `/p/$` for allocated slug) unless `navigate: false` (slash **New Page**, sidebar duplicate with `initialBlocks`); `/p/$` load uses [`resolveActiveUserPageBySlug`](../../src/lib/pages/resolve-user-page-by-slug.ts) |
| `page.update` | Title/slug/icon metadata via `page.persist` (no `navigate` effect; active-tab URL sync on blur via `syncUrl` in [`persistPageMetadata`](../../src/lib/pages/persist-page-metadata.ts), `userPage` when `routeBy === "id"`) |
| `page.delete` | Hard delete user pages or local tombstone for shipped pages |
| `page.reposition` | Sidebar DnD: `parentId`, `sidebarOrder`, metadata `slug` (+ descendant cascade via [`persistPageReposition`](../../src/lib/pages/persist-page-reposition.ts)); optional `appendPageLinkOnParent` on nest drops; optional `seed` / `parentSeed` before first local write; invalid plan → no effects |

| Effect | Applied by `usePageDispatch` |
|--------|------------------------------|
| `page.persist` | `localPagesCollection` insert/update; optional `initialBlocks` seed; descendant slug cascade; `syncPageUrl` only when `persistPageMetadata` gets `syncUrl: true` or via `persistPageReposition` (`userPage` when `routeBy === "id"`) |
| `page.delete` | `deleteLocalPage` (user hard delete or shipped tombstone) |
| `page.reposition` | Optional `parentSeed` insert, [`persistPageReposition`](../../src/lib/pages/persist-page-reposition.ts), optional [`appendChildPageLinkFromShard`](../../src/lib/pages/append-page-link-on-parent.ts) |
| `navigate` | `{ slug, userPage? }` → router [`pageNavTargetForUserPage`](../../src/lib/pages/slugify.ts) or [`pageNavTarget`](../../src/lib/pages/slugify.ts) (`replace: true`); `mode: "history"` → [`syncPageUrl`](../../src/lib/pages/sync-url.ts) with the same `userPage` flag |

Boot routing ([`useMigrateUserPageRoutes`](../../src/hooks/use-migrate-user-page-routes.ts)) and passive-tab slug sync ([`useSyncPageUrl`](../../src/hooks/use-sync-page-url.ts)) are not `PageEffect` entries — see [pages — Route migration](../architecture/pages.md#route-migration).

Canvas-only page helpers (`page.revertToServer`, `page.acknowledgeServerBaseline`) stay on **`CanvasEffect`** / **`CanvasCommand`**, not `PageEffect`. Staleness is now resolved globally from the workspace footer (**Refresh site content** → [`refreshSiteContent`](../../src/lib/pages/refresh-site-content.ts) → `page.resetToRemote`), so these in-editor revert/acknowledge helpers are not dispatched by the footer — see [author-dev-mode](../architecture/author-dev-mode.md). The read-only render views ([`page-canvas-server.tsx`](../../src/components/canvas/page-canvas-server.tsx), [`page-canvas-local-view.tsx`](../../src/components/canvas/page-canvas-local-view.tsx)) construct a no-op `CanvasEditorActions` so blocks render before the editor chunk loads without dispatching commands. Do not confuse canvas block `row.move` with `page.reposition`. Both surfaces use the [drag-and-drop toolkit](../architecture/drag-and-drop.md): sidebar whole-row drag with [`DragOverlay`](../../src/components/dnd/drag-overlay.tsx) and MIME `application/x-page-id`; canvas grip drag with MIME `application/x-canvas-row-id` and [`setClonedDragImage`](../../src/lib/dnd/drag-image.ts). Page routing and boot migration: [pages](../architecture/pages.md).
