# Block model

## Principles

- Every block has `id`, `type`, optional `parentId`, optional `indent` (0–4)
- **List** blocks are containers only (`props.variant: bullet | ordered`)
- **Checklist** blocks are containers only (empty props)
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
├── callout (parentId: null, props.text)
├── checklist (parentId: null)
│   └── checklistItem (parentId: checklist, props.text, props.checked)
├── pageLink (parentId: null, props.pageId → live title/slug)
└── divider (parentId: null, horizontal rule)
```

## Containers

Container behavior is registered on `BLOCK_SPECS[type].container` in [`src/components/blocks/registry.ts`](../../src/components/blocks/registry.ts). Shared config and helpers live in [`src/lib/canvas/block-container-config.ts`](../../src/lib/canvas/block-container-config.ts), while reducer planners read the policy through `block-interactions.ts`. Slash and Turn into conversions share the same command path; dismissed slash commands stay in the text but do not reopen the menu until the `/` prefix is removed ([canvas-editor](./canvas-editor.md#slash-menu)).

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
