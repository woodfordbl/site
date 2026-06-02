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
| `usePageCanvas` | Lazy-seed + block-level persist; reads `usePageBlocks` (live query) | Keyboard interpretation |
| `useCanvasRowActions` | Insert/move/paste placement | Content edits |

### Block identity on structural edits

Keep the **same block id** when converting or repositioning an existing row (bullet → text, list lift-out, Turn into, type changes that leave the row). Prefer reducer effects:

| Prefer | Avoid for same-id edits |
|--------|-------------------------|
| `persist` (update block fields / `parentId`) | `delete` + `insert` with the same id |
| `move` (reorder in `blockOrder`) | Recreating the row to change placement |

Delete + insert is for **new** rows (gutter insert, split remainder, new containers). Container lift-out uses [`planLiftContainerChildConversion`](../../src/lib/canvas/container-child-conversion.ts): `persist` the child as top-level text, delete the list container only when needed, `move` to document position, `focus` the same row id. `container.wrap` builds list/checklist shells via `buildWrappedContainerBlock` / `buildContainerChildBlock` in [`create-block.ts`](../../src/lib/blocks/create-block.ts) (normal block ids only; no sentinel suffixes). Enter at caret 0 inside a list/checklist child dispatches `block.liftAsText` when policy requires lift-out. Same-transaction deletes are tracked in `replacePageBlocks` (`deletedInTransaction`) so re-inserts use collection `insert`, not `update`.

## Row placement

Gutter +, drag-drop, and paste call `useCanvasRowActions` (`insertAfter`, `insertBefore`, `moveAfter`, `moveBefore`, `pasteAfter`). Placement resolves anchor row + edge in `src/lib/blocks/row-placement.ts`, then dispatches `row.insert` / `row.move` / `rows.paste`. The effect layer applies the placement to the current flat block array in `src/lib/blocks/page-block-mutations.ts`.

The resulting full array is the next document order. Structural edits persist through `replacePageBlocks`, which writes both the block rows and `localPagesCollection.blockOrder` in one transaction. Do not rely on localStorage/TanStack collection enumeration order for row order; reads must apply `blockOrder` before building the row tree.

## Focus

Reducer emits `focus` effects; `PageCanvasEditor` applies them through `tryApplyCanvasFocus` in [`apply-pending-focus.ts`](../../src/lib/canvas/apply-pending-focus.ts). Effects may set `placement` (`start` / `end`) or an explicit caret `offset` (character index); when `offset` is set it wins over placement for the active field.

Focusable row navigation (Option+↑/↓, Shift+↑/↓ range, `row.focusAdjacent`, `row.moveAdjacent`) skips container shell rows and targets leaf rows only. Shared helpers live in [`focusable-rows.ts`](../../src/lib/canvas/focusable-rows.ts) (`flattenCanvasRows`, `findFocusableAdjacentRow`). `row.moveAdjacent` in the reducer resolves the neighbor then dispatches `row.move`.

When a row is lifted out of a list container, focus is deferred until the row renders at top level (`shouldDeferCanvasFocus` retries up to 16 animation frames).

## Slash menu

Schema-driven block items from `BLOCK_SPECS` in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts). `getSlashMenuItems()` expands `heading` into Heading 1–4 entries (`headingLevel` on selection) and `list` into bullet and numbered entries (`listVariant` on selection). Page items come from [`src/lib/pages/page-slash-menu.ts`](../../src/lib/pages/page-slash-menu.ts) and [`src/lib/canvas/slash-menu-list.ts`](../../src/lib/canvas/slash-menu-list.ts): **New Page** (`page.create` with `navigate: false` + `pageLink` conversion) and **Link To Page** (inline search panel in the same popover). Root list rows use editor-driven highlight (`selectedIndex` via `handleSlashMenuKeyDown` in [`EditableSurface`](../../src/components/editor/editable-surface.tsx)); the field stays focused while filtering `/query` (typing filters, arrow keys navigate, Enter confirms, Escape dismisses and leaves `/query` in the block without reopening until the leading `/` is removed). Focus moves into the link search field when picking a page; Escape returns to the root list. Slash menu renders in a Popover anchored to the active field (`initialFocus={false}`); block-actions uses `DropdownMenu` via `createDropdownMenuHandle()` from the gutter. Both shells mount in [`CanvasMenuRoot`](../../src/components/canvas/canvas-menu-root.tsx) (single portal for slash popover + block-actions dropdown). Row-scoped slash orchestration lives in `useCanvasSlashMenu`; selection dispatches `slash.convert`, `container.wrap`, or page commands via `canvas-row.tsx`.

## Block rendering

| Layer | Role |
|-------|------|
| `BlockTreeNode` | Routes container vs leaf rows via `isContainerSpec` |
| `BlockRenderer` | Looks up `BLOCK_SPECS[block.type]`; renders `View` or `Edit` |
| `*View` / `*Edit` | Per-type UI under `src/components/blocks/types/` |
| Container `Shell` | Registered as `Container` on the spec (e.g. list → `ListView`) |

Leaf edit components receive canvas keyboard wiring from `useBlockFieldActions` according to their `behavior.editStrategy`. Block and container specs live in [`registry.ts`](../../src/components/blocks/registry.ts); container helpers in [`block-container-config.ts`](../../src/lib/canvas/block-container-config.ts). See [block-types](./block-types.md).

| Label | Block type |
|-------|------------|
| Heading 1–4 | `heading` (`props.level`: 1–4) |
| Text | `text` |
| Bullet list | `list` (`props.variant: bullet`) |
| Numbered list | `list` (`props.variant: ordered`) |
| Quote | `quote` |
| Callout | `callout` |
| Checklist | `checklist` |
| Divider | `divider` |

## Block selection

Grab handles in the gutter expose block actions and multi-select:

| Input | Action |
|-------|--------|
| Click grab (press and release without dragging) | Open block menu and highlight the row (Turn into, Duplicate, Delete) |
| Click-hold and drag grab | Reorder row; no highlight and no menu |
| Shift+click grab or row content (field area) | Extend range from selection anchor, or from the row with the active caret if selection was cleared by editing; blurs the active field |
| Shift+↑ / Shift+↓ (focused block) | Same range extension as Shift+click, stepping one focusable row at a time |
| Option+↑ / Option+↓ (focused block) | Move the row before/after the adjacent focusable row (`row.moveAdjacent` → `row.move`) |
| Cmd/Ctrl+click grab | Toggle block in selection (unchanged) |
| Cmd/Ctrl+A | Select all rows |
| Delete / Backspace | `selection.delete` when blocks selected and field unfocused |
| Cmd/Ctrl+C | Copy selected blocks (plain text to system clipboard) |
| Cmd/Ctrl+V | `rows.paste` after last selected / focused row (via `paste` event) |
| Escape | Clear block selection |
| Click outside grab / menu | Clear block selection; block menu closes immediately |

**Block menu:** Turn into dispatches `slash.convert` or `container.wrap` (Heading 1–4, Text, Quote, Callout, Bullet list, Numbered list, Checklist, Divider). Duplicate clones the row via `rows.paste`. Copy is keyboard-only (Cmd/Ctrl+C). Delete dispatches `row.delete`. Turn into is available for inline-text blocks only (`text`, `heading`, `quote`, `callout`). List and checklist containers: a plain grab click selects all child rows; Cmd/Ctrl+click toggles all children.

Text fields keep native copy/paste while focused. Block selection clears when editing starts; Shift+click on another row’s grab or field still ranges from the row being edited. Clicking outside the grab handle and menu portal clears selection. The block-actions menu closes immediately (no exit animation) when focus leaves the menu or grab trigger.

## Drag and drop

Grab-handle drag calls `moveAfter` / `moveBefore` (dispatches `row.move`). Drag start clears block selection so the source row is not highlighted during the move. Row id travels on a custom drag type (`application/x-canvas-row-id`), not `text/plain`, so editor fields do not show a text-insertion caret while hovering. While dragging:

- A ghost preview clones the row content (`setCanvasRowDragImage`).
- A canvas-level drop zone in `PageCanvasEditor` resolves the insertion target from pointer Y via `resolveDropTargetFromPointer` (row rects from `[data-canvas-row-id]`). The same resolver runs on `dragover` and `drop` so the line and committed move always match.
- Drop targets show a single `--selection` insertion line before/after the resolved row (`normalizeDropTarget` dedupes adjacent edges). Nested list rows win over their parent container when rects overlap (deepest row first).
- When the pointer is above the first top-level row or below the last top-level row (including over the page footer), the target snaps to the beginning or end of the page row list.
- Editor fields ignore pointer events until the drag ends.

## Keyboard

| Key | Action |
|-----|--------|
| ↑ / ↓ (focused field, caret at boundary) | `row.focusAdjacent` |
| Option+↑ / Option+↓ (focused field) | `row.moveAdjacent` (reorder before/after focusable neighbor) |
| Shift+↑ / Shift+↓ (focused field) | Extend block selection to the focusable neighbor (blurs field; same anchor rules as Shift+click) |
| Tab | `indent.adjust` |
| Enter | `row.split` at caret (text after caret → new block of same type); at end of row → empty `text` block after; at caret 0 on non-empty top-level row → empty row before, focus stays on original row; **list child at caret 0** lifts out as top-level `text` (empty or not) |
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

When content edits or structural edits need a new blank row, `usePageCanvas` persists the normalized full block list through the same `replacePageBlocks` + `blockOrder` path as gutter inserts. See [pages](./pages.md#empty-canvas).

## Page footer

When editing a page, the canvas footer (`PageCanvasFooter`) sits below the block list:

| Button | When | Action |
|--------|------|--------|
| **Save to source** | `import.meta.env.DEV` | Writes `content/pages/{slug-path}.json` via `savePage` with the resolved local title/slug/parentId, then deletes the local page document |
| **Reset** | Local page document exists | Confirms, then `resetToServer` — discards localStorage overrides |

See [author-dev-mode](./author-dev-mode.md) for the save workflow.

## Page routes

Shipped and lazy-seeded pages load through the splat route (`src/routes/$.tsx`) so multi-segment slugs such as `/work/projects` resolve server JSON. User-created pages load through `src/routes/p.$pageId.tsx` with an `isUserCreatedPage` guard. Legacy user slug paths on the splat route redirect to `/p/$pageId`.

## Sidebar page list

Top-level pages render as ghost navigation buttons with a right-click context menu (duplicate, inline rename, delete). See [pages](./pages.md#page-list).
