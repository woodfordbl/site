# Block model

## Principles

- Every block has `id`, `type`, optional `parentId`, optional `indent` (0–4)
- **List** blocks are containers only (`props.variant: bullet | ordered`)
- **Checklist** blocks are containers only (empty props)
- **Columns** blocks are containers only (empty props); children are **column** blocks only
- **Column** blocks are generic-scope containers (`allowedChildTypes: *`); children are normal canvas rows (text, heading, nested list, etc.)
- **Tabs** blocks are containers (`props.defaultTabId` — the author's default tab); children are **tab** blocks only
- **Tab** blocks are generic-scope containers (`allowedChildTypes: *`) with `props.label` (the tab name); children are normal canvas rows
- **Table** blocks are containers (`hasHeaderRow`, `columnWidths[]`); children are **tableRow** only. Trailing row/column count can be adjusted via plus-control pointer scrub — [table-blocks](./table-blocks.md#trailing-plus-controls).
- **Table row** blocks are containers (empty props); children are **tableCell** only (sibling order = column index)
- **Table cell** blocks are leaves with `props.text` (plain text only in v1)
- List items are normal **text** blocks with `parentId = list.id`
- Checklist items are **checklistItem** blocks with `parentId = checklist.id` and `props.checked`
- Indent is only on `block.indent`, never embedded in list props

## Minimum page content

`normalizeEditablePageBlocks` (`src/lib/blocks/ensure-minimum-blocks.ts`) applies two editor invariants:

1. **At least one block** — blank pages get a normal empty `text` block.
2. **At least one trailing empty `text` row** — when the last top-level row is not empty `text`, append a normal empty `text` block. Multiple user-created blank rows at the end are kept; the helper only ensures a minimum of one.

Editor blank rows use the same block shape and ids as rows inserted from the gutter. `usePageCanvas` writes the normalized block list through structural persistence whenever a new trailing blank has to be created, so `blockOrder` includes the blank row like any other row. User pages created with `page.create` persist the first empty block immediately unless `initialBlocks` is provided. **Save to source** keeps normal blank rows in shipped JSON.

Full-page duplicate remaps every block `id` and in-page `parentId` via `clonePageBlocks` (`src/lib/pages/clone-page-blocks.ts`) before `page.create` seeds the copy.

## Tree

```
page (canvas)
├── text (parentId: null)
├── list (parentId: null)
│   ├── text (parentId: list)
│   └── text (parentId: list, indent: 1)
├── heading (parentId: null, props.level: 1 | 2 | 3 | 4)
├── quote (parentId: null, props.text)
├── callout (parentId: null, props.text, optional props.icon — emoji or `tabler:IconName`)
├── checklist (parentId: null)
│   └── checklistItem (parentId: checklist, props.text, props.checked)
├── pageLink (parentId: null, props.pageId → live title/slug; optional props.variant: `child` | `linked`)
├── columns (parentId: null)
│   ├── column (parentId: columns, optional props.width flex ratio)
│   │   ├── text / heading / … (parentId: column)
│   │   └── list (parentId: column) …
│   └── column …
├── tabs (parentId: null, optional props.defaultTabId)
│   ├── tab (parentId: tabs, props.label)
│   │   ├── text / heading / … (parentId: tab)
│   │   └── list (parentId: tab) …
│   └── tab …
├── table (parentId: null | column, props.hasHeaderRow, props.columnWidths in px — legacy ratio values ≤10 migrate at render)
│   ├── tableRow (parentId: table)
│   │   ├── tableCell (parentId: tableRow, props.text)
│   │   └── tableCell …
│   └── tableRow …
├── media (parentId: null | column, props.kind: image | video, props.source: url | asset, props.src, optional props.widthPercent 25–100)
├── embed (parentId: null | column, props.url; optional title/description/imageUrl; showCaption + caption below preview)
└── divider (parentId: null, horizontal rule)
```

The canvas builds this forest with `buildBlockTree` in [`src/lib/blocks/block-tree.ts`](../../src/lib/blocks/block-tree.ts) (`CanvasRow`: `rowId`, `effectiveBlock`, `children`), grouping already-ordered blocks by parent in one pass and caching per-block normalization. `reconcileRowTrees` provides structural sharing across rebuilds — unchanged rows keep object identity so memoized row components bail out.

## Containers

Container types are declared in `CONTAINER_BLOCK_TYPES` ([`src/lib/blocks/block-defs.ts`](../../src/lib/blocks/block-defs.ts)); container policy is `BLOCK_CONTAINER_CONFIG` in [`src/lib/canvas/block-container-config.ts`](../../src/lib/canvas/block-container-config.ts) — a complete `Record<ContainerBlockType, ContainerDefinition>` (no registry fallbacks). `BLOCK_SPECS[type].container` in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts) references the same entries; reducer planners read the policy through `block-interactions.ts`. Slash and Turn into conversions share the same command path; dismissed slash commands stay in the text but do not reopen the menu until the `/` prefix is removed ([canvas-editor](./canvas-editor.md#slash-menu)).

Each container defines:

- `allowedChildTypes` (list: `text` only; checklist: `checklistItem` only)
- `defaultChildType`
- `onEmptyChildEnter` / `onCaretStartChildEnter` / `onEmptyChildDelete`
- `onDisallowedChildConversion`
- `insertSiblingOnEnter`
- `acceptEmptyMergeFromAfter`
- `Container` shell component (e.g. list → `ListView`, checklist → `ChecklistView`)

Container children are validated against policy on read via `coerceContainerChildBlocks`; list children are coerced to `text` and checklist children to `checklistItem` when needed.

**Lift-out / conversion:** When a container child becomes a top-level row, mutate the existing block (`persist` + `move`) rather than delete and recreate it with the same id. Focus after lift-out is deferred until the row renders outside the container ([`apply-pending-focus.ts`](../../src/lib/canvas/apply-pending-focus.ts)). See [canvas-editor](./canvas-editor.md#block-identity-on-structural-edits).

## User block ordering

User-created and edited blocks persist as rows in `localBlocksCollection` (one record per block, grouped by `pageId`). Document order is stored on the page metadata as `blockOrder` and applied when reading the shard. Placement for insert/move/paste uses anchor row + edge (`RowPlacement` in `src/lib/blocks/row-placement.ts`) and is applied to the flat block array in `src/lib/blocks/page-block-mutations.ts`. UI hooks: `useCanvasRowActions` (`insertAfter`, `insertBefore`, `moveAfter`, etc.).

`blockOrder` must contain the full flat block id list after every structural edit. This mirrors block editors like BlockNote/Lexical: block ids are stable, but sibling order belongs to the document model, not to object storage iteration. Structural persistence must save the next full order with the rows so repeated gutter inserts and boundary moves do not drift.

## Structural actions

Backspace/Delete use `resolveStructuralAction` — see [structural-actions](../reference/structural-actions.md). Empty list or checklist items with a previous sibling delete in place and focus the previous item; first or sole empty items lift to `text`.
