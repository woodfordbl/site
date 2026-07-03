# Databases

Notion-style databases: workspace-level entities with typed fields, saved views, and
sharded row storage, rendered on the canvas through the `database` block. Design
rationale and the full multi-phase plan live in the
[proposal](../proposals/notion-style-databases.md); this page documents what is built.

## Model

A database is **not** a block subtree. Rows never enter the block tree — the `database`
block ([`database-view.tsx`](../../src/components/blocks/types/database/database-view.tsx),
[`database-edit.tsx`](../../src/components/blocks/types/database/database-edit.tsx)) holds
only `{ databaseId, viewId? }` ([`block-props.ts`](../../src/lib/schemas/block-props.ts)).
Multiple blocks may reference one database (linked views).

Schemas in [`database.ts`](../../src/lib/schemas/database.ts):

| Entity | Shape |
|--------|-------|
| `LocalDatabase` | `id`, `name`, `icon?`, `primaryFieldId`, `fields[]`, `views[]`, timestamps |
| `DatabaseField` | Discriminated union on `type`: `text`, `number` (format), `checkbox`, `select`/`multiSelect` (options `{id,name,color?}`), `date`, `url`. Stable `id` — renames never rewrite rows |
| `LocalDatabaseRow` | `id`, `databaseId`, sparse `values: Record<fieldId, CellValue>`, sparse manual `order`, lazy `pageId`, timestamps |
| `DatabaseView` | `type: "table"`, `filter?` (two-level and/or grammar), `sorts?`, `visibleFieldIds?`, `config` (column order/widths, `pinnedFieldIds`, `calculations`, `wrapFieldIds`) |

Invariants: every database has exactly one primary (title-like) field —
`removeDatabaseField` refuses it; cell values are field-typed with `null`/missing = empty;
drag-reorder semantics use `order` only when the active view has no sorts.

## Storage

| Collection | Key | Persistence |
|------------|-----|-------------|
| `localDatabasesCollection` | `site-local-databases` | Single localStorage key (definition rows are small) |
| `localDatabaseRowsCollection` | `site-local-db-rows:<databaseId>` shards | [`database-sharded-row-storage.ts`](../../src/db/collections/database-sharded-row-storage.ts) — per-shard diffing, cross-tab storage events, parse quarantine (`site-local-db-rows-quarantine`), mirroring the block-shard adapter |

The rows collection carries a **BTree index on `databaseId`** (created in
[`local-collections.ts`](../../src/db/collections/local-collections.ts)); `createIndex`
requires an explicit `indexType` — omitting it throws at module init.

## Mutations and reads

All writes are single explicit-commit transactions
(`createTransaction({ autoCommit: false })`) with failures routed to
`reportPersistenceError`: see
[`database-collection-ops.ts`](../../src/db/queries/database-collection-ops.ts)
(database create/rename/delete, row insert/reorder/delete with midpoint-then-renumber
sparse ordering, cell merge, field add/update/remove/duplicate with full view-reference
stripping, view patches). Live reads:
[`use-database.ts`](../../src/db/queries/use-database.ts) (`useDatabase`,
`useDatabaseRows` — declarative `eq` so the index serves the query).

Pure domain logic lives in [`src/lib/databases/`](../../src/lib/databases/) (React-free):
field-type defs and operator sets (`field-defs.ts`), cell
coercion/formatting/plain-text (`cell-values.ts`), filter evaluation (`row-filter.ts` —
fail-open on stale field references), type-aware sorting with empties-last
(`row-sort.ts`), the Calculate aggregate taxonomy (`row-aggregate.ts`), view column
resolution (`view-config.ts`), and the default seed (`database-defaults.ts`).

## Table view

[`components/database/`](../../src/components/database/) renders the grid:

- [`database-table-view.tsx`](../../src/components/database/database-table-view.tsx) —
  entry: resolves database + first view, applies `applyFilter` → `sortRowsForView` →
  `resolveColumnOrder`, mounts title, filter bar (edit mode), grid.
- [`database-table-grid.tsx`](../../src/components/database/database-table-grid.tsx) —
  TanStack Table in **fully manual mode** (core row model only; data computation stays in
  the lib layer) + TanStack Virtual rows (36px, overscan 12, `max-h-[600px]` scrollport);
  sticky header with field-type icons and column-menu triggers; pinned columns as
  cumulative-offset `position: sticky` with a scroll-gated edge fade; grid ARIA roles;
  memoized rows (stable callbacks via a latest-values ref; row identity from the
  collection layer's structural sharing).
- Cells/editors: display renderers per type
  ([`database-cell.tsx`](../../src/components/database/database-cell.tsx), option pills on
  block color tokens), inline input editors for text/url/number + checkbox toggle,
  popover editors for select/multiSelect (searchable
  [`database-option-combobox.tsx`](../../src/components/database/database-option-combobox.tsx)
  with create-option) and date (react-day-picker), Tab/Enter navigation
  (`nextEditTarget` in
  [`database-grid-helpers.ts`](../../src/components/database/database-grid-helpers.ts)).
- [`database-column-menu.tsx`](../../src/components/database/database-column-menu.tsx) —
  Notion-style property menu: rename, Edit property (per-type config), Change type, Sort
  (single-key toggle), Calculate picker, Freeze up to column, Hide, Wrap, Insert
  left/right, Duplicate/Delete (primary-field guarded).
- [`database-filter-bar.tsx`](../../src/components/database/database-filter-bar.tsx) —
  Linear-style chips (`field · operator · value` segment popovers), type-ahead add-filter
  picker, match all/any control, sort chips; pure mutations in
  [`database-filter-helpers.ts`](../../src/components/database/database-filter-helpers.ts).

## Block integration

`database` is a **leaf** block (`inline-custom` strategy, media/embed capabilities). The
edit wrapper only forwards structural keys when the event target is the wrapper itself —
keystrokes inside grid cells must never delete the block. An unlinked block shows the
shared placeholder trigger; its action seeds `createDefaultDatabaseSeed()` through
`createDatabaseWithDefaults` and links the block. Deleting a database block does **not**
delete the database entity (blocks are references; entity lifecycle UI is future work).

## Deferred (see proposal phases)

Row drag-reorder UI, linked-view/`viewId` threading and multi-view switching, row pages
(`pageId` is schema-ready), relations/rollups/formulas, board/gallery/list/chart views,
connectors/sync, workspace backup inclusion, SQLite scale tier, dynamic row heights for
wrapped cells (line-clamped today), keyboard Tab-into-cell entry.
