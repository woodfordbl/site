# Canvas commands

Block UI dispatches these via `useBlockFieldActions` / `BlockRenderer` (canvas context) or slash menu. The slash menu root list is built by [`buildRootSlashMenuItems`](../../src/lib/canvas/slash-menu-list.ts) and rendered as plain command rows in a field-anchored Popover (editor-driven selection at root; inline search panel for page link targets). Escape or outside dismiss suppresses reopen until the leading `/` is removed from the block text. Persisted block rows update `localBlocksCollection` immediately on content edits; structural commands batch-replace the page's blocks and `localPagesCollection.blockOrder` in one transaction via `replacePageBlocks`. Block types register in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts); container policy in [`src/lib/canvas/block-container-config.ts`](../../src/lib/canvas/block-container-config.ts).

## Row lifecycle

| Command | Trigger |
|---------|---------|
| `row.update` | Field onChange |
| `row.insert` | Gutter + — position `{ parentId, anchorRowId, edge }` or `{ parentId, atScopeStart }` |
| `row.split` | Enter in text block at caret (text after caret → new block of same type); at end of row → empty `text` block after; at caret 0 on non-empty top-level row → empty row before (same type), focus stays on original row; on empty top-level row → empty `text` row after; **list child at caret 0** lifts out as top-level `text` (empty or not; splits list when needed) |
| `row.delete` | Structural resolver; gutter menu **Delete** |
| `row.convert` | Slash selection; gutter menu **Turn into**. Container children stay inside only when container policy allows the target; list items stay in the list only for `text → text`; other targets lift the item out and split the list when needed. |
| `row.move` | Drag block to new position (grab handle), or Option+↑/↓ on a focused row (`row.moveAdjacent`). `PageCanvasEditor` resolves drag targets from pointer Y via `resolveDropTargetFromPointer`; off-page pointer snaps to first/last top-level row. |
| `selection.delete` | Delete selected blocks (Delete / Backspace) |
| `rows.paste` | Paste copied blocks after selection or focus; gutter menu **Duplicate** |

## Row actions hook

Gutter, drag-drop, and paste use `useCanvasRowActions` (via canvas editor context):

| Method | Dispatches |
|--------|------------|
| `insertAfter` / `insertBefore` | `row.insert` |
| `insertAtScopeStart` | `row.insert` at scope index 0 |
| `moveAfter` / `moveBefore` | `row.move` |
| `pasteAfter` / `pasteBefore` | `rows.paste` |

Placement math lives in `src/lib/blocks/row-placement.ts`. Drag target resolution lives in `src/lib/canvas/resolve-drop-target.ts` (`normalizeDropTarget`, `resolveDropTargetFromPointer`, `collectCanvasRowRects`).

Structural row commands must persist the full next document order, not only the changed block row. `replacePageBlocks` accepts both page metadata and block row mutations so `blockOrder` stays in sync with the local block shard.

## Structural

| Command | Meaning |
|---------|---------|
| `indent.adjust` | Tab / Shift+Tab / outdent at caret 0 |
| `block.mergeTextIntoPreviousSibling` | Join text with previous sibling |
| `block.mergeIntoPreviousCanvasRow` | Empty ¶ after a container that accepts empty merge → last child |
| `block.liftAsText` | Exit container child as text block (indent preserved; sole child deletes the container; empty list first item with no previous sibling) |
| `container.wrap` | Wrap row in list (`variant`: `bullet` or `ordered`) or checklist using `buildWrappedContainerBlock` / `buildContainerChildBlock`. Container children lift out first, then wrap at that canvas position (no nested containers). |
| `container.unwrap` | Collapse empty container (empty list first or sole item uses `block.liftAsText`; empty list item with previous sibling uses `row.delete`) |

## Page stale (seeded server pages)

| Command | Meaning |
|---------|---------|
| `page.revertToServer` | Replace local page blocks with server JSON |
| `page.acknowledgeServerBaseline` | Keep local blocks, refresh `serverBaselineHash` |

## Focus

| Command | Meaning |
|---------|---------|
| `focus.set` | Focus row (`placement`: `start`/`end`, or explicit `offset` character index) |
| `focus.clear` | Clear focus request |
| `row.focusAdjacent` | Up/down navigation at caret boundary (skips container shells; [`focusable-rows.ts`](../../src/lib/canvas/focusable-rows.ts)) |
| `row.moveAdjacent` | Option+↑/↓ — reducer finds adjacent focusable row, then dispatches `row.move` before/after it |

Reducer `focus` effects mirror `focus.set` (`placement` and/or `offset`). `apply-pending-focus` uses `offset` when present so merge/lift paths restore the caret after structural edits.

Focus effects are applied in `useCanvasEditor` via `tryApplyCanvasFocus` ([`apply-pending-focus.ts`](../../src/lib/canvas/apply-pending-focus.ts)). List lift-out defers focus until the row is no longer rendered under its former container row.

## Gutter block menu

Press and release the grab handle (without dragging) highlights the row and opens the block-actions dropdown. Shift+click on the grab or row content extends a range from the selection anchor or the row with the active caret (via `getActiveCanvasRowId`); it blurs the field and does not open the menu. Cmd/Ctrl+click on the grab toggles selection (unchanged). Click-hold drag reorders with no highlight or menu. The menu dismisses immediately on outside pointer down or focus loss (no close animation). Menu actions use existing commands:

| Menu item | Dispatches / hook |
|-----------|-------------------|
| Turn into | `slash.convert` or `container.wrap` (inline-text blocks only) |
| Duplicate | `rows.paste` via `duplicateRow` (clones row or list subtree) |
| Delete | `row.delete` |

Copy is keyboard-only: Cmd/Ctrl+C copies selected rows to the canvas clipboard (`copySelection` / `copyRow`), not a gutter menu item.

Conversion helper: `src/lib/canvas/apply-block-conversion.ts`. Subtree clone for duplicate: `src/lib/canvas/clone-row-subtree.ts`.

## Slash

| Command | Meaning |
|---------|---------|
| `slash.convert` | Convert block type (Heading 1–4, Text, Bullet list, Numbered list, Checklist, Quote, Page link, Divider). Container children lift out unless the container allows the target. Heading selections pass `headingLevel` (1–4). List selections use `container.wrap` with `listVariant`. Checklist selections use `container.wrap` with `containerType: checklist`. Page link selections pass `pageId`. |

## Author (dev only)

| Command / UI | Meaning |
|---------|---------|
| `author.saveToSource` / `author.loadFromDisk` | No-ops in `canvasReducer` (reserved) |
| Footer **Save to source** | Calls `savePage` + `exportPageDocument` directly from `PageCanvasFooter` (dev only) |
| Footer **Reset** | Discards local page document via `resetToServer` |

Author save exports `parentId` with the page document so nested JSON paths round-trip correctly. Normal blank rows are exported like any other user row.

## Render invariants

`normalizeEditablePageBlocks` runs before the editor builds rows. Pages always have at least one block and at least one trailing empty top-level `text` row when the last stored row is not already blank. Blank rows use normal block ids and are persisted through the same full-order structural write path as inserted rows. See [pages](../architecture/pages.md#empty-canvas).

## Page commands

Page lifecycle (`page.create`, `page.update`, `page.delete`) lives in [`page-commands.md`](./page-commands.md). `page.create` navigates to `/p/{pageId}`; slash **New Page** passes `navigate: false`. `page.create` accepts optional `initialBlocks` to seed a new user page (sidebar **Duplicate page** uses `clonePageBlocks` before create).
