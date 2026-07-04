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
  `resolveColumnOrder`, mounts title row, filter bar (edit mode, wide viewports), grid.
  On narrow viewports the chip bar collapses into funnel/sort icon buttons inline with
  the title ([`database-mobile-toolbar.tsx`](../../src/components/database/database-mobile-toolbar.tsx)),
  each opening a popover that reuses the extracted chip strips.
- [`database-table-grid.tsx`](../../src/components/database/database-table-grid.tsx) —
  TanStack Table in **fully manual mode** (core row model only; data computation stays in
  the lib layer) + TanStack Virtual rows (36px, overscan 12, `max-h-[600px]` scrollport);
  sticky header with field icons ([`resolveFieldIcon`](../../src/components/database/database-field-icons.ts):
  custom emoji/`tabler:` glyph → type-icon fallback) and column-menu triggers; pinned
  columns as cumulative-offset `position: sticky` with a scroll-gated edge fade (pinned
  columns auto-unpin visually when the frozen span exceeds the scrollport so phones can
  always reach unfrozen columns); grid ARIA roles; memoized rows (stable callbacks via a
  latest-values ref; row identity from the collection layer's structural sharing).
  **Column resizing** ([`use-database-column-resize.ts`](../../src/components/database/use-database-column-resize.ts) +
  [`database-column-resize-zone.tsx`](../../src/components/database/database-column-resize-zone.tsx)):
  edge hit zones (wider on coarse pointers, `touch-none` scoped to the zone), hover-reveal
  `bg-selection` dividers, live rAF widths committed to `view.config.columnWidths`,
  double-click/tap reset. **Header drag-reorder**
  ([`use-database-column-drag.ts`](../../src/components/database/use-database-column-drag.ts) +
  [`database-column-dnd.tsx`](../../src/components/database/database-column-dnd.tsx)):
  press-threshold drag on fine pointers (click still opens the menu, on release),
  450ms long-press lift on coarse; full-grid-height `bg-selection-primary` drop lines;
  drop writes `columnOrder` and derives `pinnedFieldIds` from the freeze-boundary rule
  (left of the boundary pins, right unpins, exactly on it keeps state). Vertical cell
  separators are per view (`config.showVerticalLines`, absent = shown); the last column
  never draws a right border so the add-field strip sits flush.
- Cells/editors: display renderers per type
  ([`database-cell.tsx`](../../src/components/database/database-cell.tsx), option pills on
  block color tokens), inline input editors for text/url/number + checkbox toggle,
  popover editors for select/multiSelect (searchable
  [`database-option-combobox.tsx`](../../src/components/database/database-option-combobox.tsx)
  with create-option) and date (react-day-picker), Tab/Enter navigation
  (`nextEditTarget` in
  [`database-grid-helpers.ts`](../../src/components/database/database-grid-helpers.ts)).
- [`database-column-menu.tsx`](../../src/components/database/database-column-menu.tsx) —
  Notion-style property menu: rename, Edit property (per-type config incl. select-option
  rename/add/delete and color via the shared block-color palette,
  [`database-option-color-menu.tsx`](../../src/components/database/database-option-color-menu.tsx)),
  Change type, Change/Remove icon (shared `GlyphIconPicker`, intent-preloaded), Sort
  (multi-key append/toggle/flip with 1-based priority numbers), Calculate picker, Freeze
  up to column, Hide, Wrap, Insert left/right, Duplicate/Delete (primary-field guarded).
  `DropdownMenuLabel` must sit inside `DropdownMenuGroup` (Base UI context — naked labels
  crash at render).
- [`database-filter-bar.tsx`](../../src/components/database/database-filter-bar.tsx) —
  Linear-style chips (`field · operator · value` segment popovers), type-ahead add-filter
  picker, match all/any control, and per-sort priority chips (flip direction, remove,
  move left/right); exports the chip strips (`DatabaseFilterChips`, `DatabaseSortChips`,
  `DatabaseFilterMatchOp`) reused by the mobile toolbar popovers; pure mutations in
  [`database-filter-helpers.ts`](../../src/components/database/database-filter-helpers.ts).
- [`database-title.tsx`](../../src/components/database/database-title.tsx) — h3-equivalent
  title (shares `headingTypographyClassNames[3]`), rename-in-place, filtered row count,
  and the ⋯ [`database-settings-menu.tsx`](../../src/components/database/database-settings-menu.tsx):
  rename, Properties (reorder via `reorderDatabaseFields`, hide/show, Title badge), Views
  (inline rename), Hide title switch (block prop `hideTitle`, per placement), Vertical
  separators switch, Source info, two-step Delete database, stats footer.

## Draft-proxy invariant (mutations)

TanStack DB `update` drafts are change-tracking proxies. **Never spread draft objects
into the stored document** — zod v4's `z.record` validation rejects proxied records on
the next write (`updateDatabaseView`/`removeDatabaseField` JSON-flatten via `toPlain`
before rebuilding `views`; regression-tested with proxied drafts in
[`database-collection-ops.test.ts`](../../src/db/queries/database-collection-ops.test.ts)).

## Block integration

`database` is a **leaf** block (`inline-custom` strategy, media/embed capabilities). The
edit wrapper only forwards structural keys when the event target is the wrapper itself —
keystrokes inside grid cells must never delete the block. An unlinked block shows the
shared placeholder trigger; its action seeds `createDefaultDatabaseSeed()` through
`createDatabaseWithDefaults` and links the block. Deleting a database block does **not**
delete the database entity (blocks are references; entity lifecycle UI is future work).

## Deferred (see proposal phases)

Row drag-reorder UI, linked-view/`viewId` threading and multi-view switching ("Add view"
and view styles), row pages (`pageId` is schema-ready), relations/rollups/formulas,
board/gallery/list/chart views, connectors/sync, workspace backup inclusion, SQLite scale
tier, keyboard Tab-into-cell entry, on-screen-keyboard layout testing.
