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
| `LocalDatabase` | `id`, `name`, `icon?`, `primaryFieldId`, `source?` (`local` \| `connector` `{connectorId, config, refreshMs?}`), `fields[]`, `views[]`, timestamps |
| `DatabaseField` | Discriminated union on `type`: `text`, `number` (display config: `format` plain/integer/percent/currency, `decimals?` 0-6 fixed fraction digits, `useGrouping?` thousands separators — absent = on), `checkbox`, `select`/`multiSelect` (options `{id,name,color?}`), `date` (`format?` default/long/relative/iso; `relative` cells re-render on the table view's minute clock tick, and fall back to the default display in Calculate-row aggregates), `url`. All display-only — stored values unchanged. Stable `id` — renames never rewrite rows. `sourceKey?` marks a connector-synced column |
| `LocalDatabaseRow` | `id`, `databaseId`, sparse `values: Record<fieldId, CellValue>`, sparse manual `order`, lazy `pageId`, `externalId?` (connector row identity), timestamps |
| `DatabaseView` | `type: "table"`, `filter?` (two-level and/or grammar; date conditions add `between` — value `[startIso, endIso]`, inclusive, swapped bounds normalized — plus valueless relative windows `pastDay/pastWeek/pastMonth/pastYear/thisWeek/thisMonth/nextWeek/nextMonth` computed from local "today" (`relativeDateWindow` in `row-filter.ts` documents the exact bounds; weeks start Sunday per date-fns defaults) — the table view's minute clock tick re-runs `applyFilter` while a relative operator is active), `sorts?`, `visibleFieldIds?`, `config` (column order/widths, `pinnedFieldIds`, `calculations`, `wrapFieldIds`) |

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
fail-open on stale field references and malformed `between` values; relative date
windows read an injectable clock, `RowFilterOptions.now`), type-aware sorting with empties-last
(`row-sort.ts`), the Calculate aggregate taxonomy (`row-aggregate.ts`), view column
resolution (`view-config.ts`), and the default seed (`database-defaults.ts`).

## Table view

[`components/database/`](../../src/components/database/) renders the grid:

- [`database-table-view.tsx`](../../src/components/database/database-table-view.tsx) —
  entry: resolves database + the **active view** (`views.find(v => v.id === block.viewId)
  ?? views[0]` — the pick is per BLOCK, like Notion linked views: edit mode persists a
  switch onto `props.viewId` through the block `onChange` flow; view mode can't write
  block props, so switching falls back to ephemeral local state), applies `applyFilter` →
  `sortRowsForView` → `resolveColumnOrder`, mounts title row and filter bar (edit mode,
  wide viewports), then the per-type body: `table` renders the grid below, while
  `list`/`board`/`chart` mount the renderers in
  [`views/`](../../src/components/database/views/) with the shared contract
  `{ database, view, fields, rows, mode }` (rows arrive filtered + sorted +
  formula-merged). Filter/sort/group UI always writes to the active view's id.
  On narrow viewports the chip bar collapses into funnel/sort icon buttons inline with
  the title ([`database-mobile-toolbar.tsx`](../../src/components/database/database-mobile-toolbar.tsx)),
  each opening a popover (drawer on touch) that reuses the extracted chip strips. Empty
  states use the shared centered-icon [`Empty`](../../src/components/ui/empty.tsx)
  component (funnel / sort-arrows icon + title + description), and both add triggers
  render **full width** inside the drawer's own padding (`AddFilterChip` /
  `AddSortButton` with `fullWidth`, dashed `w-full` buttons). `AddSortButton` is a
  standalone type-ahead picker that appends an ascending sort (already-sorted fields
  drop out) — sorts no longer require the column header menu to add. Both add triggers
  share a `FieldPickerPopover` (search + field list; drops its max-height in drawer
  presentation so the single outer scroller owns scrolling).
- [`database-view-switcher.tsx`](../../src/components/database/database-view-switcher.tsx) —
  saved-view tabs in the title row: `TabsList` **`indicator`** variant, one compact tab
  per view (type icon + name, truncated), horizontally scrollable on overflow. Edit mode
  appends a "+" opening the Add-view menu (Table/List/Board/Chart), which creates via
  `addDatabaseView` (per-type defaults: board adopts the first select field as
  `groupFieldId`; chart starts `bar`/`count` over the first select-or-date field; names
  dedupe with a numeric suffix) and activates the new view. View mode is switch-only and
  hides the tabs entirely for single-view databases.
- [`database-table-grid.tsx`](../../src/components/database/database-table-grid.tsx) —
  TanStack Table in **fully manual mode** (core row model only; data computation stays in
  the lib layer) + TanStack Virtual rows (36px, overscan 12, `max-h-[600px]` scrollport);
  sticky header with field icons ([`resolveFieldIcon`](../../src/components/database/database-field-icons.ts):
  custom emoji/`tabler:` glyph → type-icon fallback) and column-menu triggers; pinned
  columns as cumulative-offset `position: sticky` with a scroll-gated edge shadow — one
  full-height `.database-grid-pinned-shadow` overlay at the frozen boundary spanning
  header through calculate row (per-cell box-shadows broke at row borders), positioned
  against a wrapper around the scrollport only; header and body cells are `isolate`
  stacking contexts so per-cell z-indexed children (the z-20 resize zones, always
  visible on touch) cannot paint above the sticky pinned cells scrolling over them
  (pinned columns auto-unpin visually when the frozen span exceeds the scrollport so
  phones can always reach unfrozen columns); grid ARIA roles; memoized rows (stable
  callbacks via a latest-values ref; row identity from the collection layer's
  structural sharing).
  **Column resizing** ([`use-database-column-resize.ts`](../../src/components/database/use-database-column-resize.ts) +
  [`database-column-resize-zone.tsx`](../../src/components/database/database-column-resize-zone.tsx)):
  edge hit zones (wider on coarse pointers, `touch-none` scoped to the zone), hover-reveal
  `bg-selection` dividers, live rAF widths committed to `view.config.columnWidths`,
  double-click/tap reset. **Header drag-reorder**
  ([`use-database-column-drag.ts`](../../src/components/database/use-database-column-drag.ts) +
  [`database-column-dnd.tsx`](../../src/components/database/database-column-dnd.tsx)):
  press-threshold drag on fine pointers (click still opens the menu, on release),
  450ms long-press lift on coarse; full-grid-height `bg-selection-primary` drop lines;
  the wrapper's capture-phase `stopPropagation` (which keeps the press away from the
  menu trigger) ignores events that land in the portaled column-menu drawer/popover —
  the portal stays in this React subtree, and swallowing its pointerdowns would break
  the drawer's swipe-to-dismiss (see the drawer drag contract in
  [canvas-editor](./canvas-editor.md));
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
  title (shares `headingTypographyClassNames[3]`), rename-in-place, a database **icon**
  beside the name (edit mode opens the shared `GlyphIconPicker` — emoji or `tabler:` glyph
  — writing `database.icon` via `setDatabaseIcon`, falling back to the database glyph when
  unset; view mode shows the icon only when one is set), a minimal sync
  chip for connector databases
  ([`database-sync-status-chip.tsx`](../../src/components/database/database-sync-status-chip.tsx));
  no row-count label (counts live in the settings menu's stats footer / Source section),
  and the ⋯ [`database-settings-menu.tsx`](../../src/components/database/database-settings-menu.tsx):
  rename, Properties (each row: a left grip that drag-reorders the schema via
  `reorderDatabaseFields` — pointer-based, works in the popover and the touch drawer, see
  [`use-list-reorder.ts`](../../src/components/database/use-list-reorder.ts) — the field
  name with a Title badge beside the primary field, and hide/show + delete
  (`removeDatabaseField`) controls on non-primary rows), Views
  (inline rename with type icon, per-view Duplicate — `duplicateDatabaseView`, "<name>
  copy" activated on create — and Delete, disabled on the last view and refused at the op
  level by `removeDatabaseView`; plus the Add-view entries shared with the switcher's
  "+"), Hide title switch (block prop `hideTitle`, per placement), Vertical separators
  and Page icons switches (table views only — `showVerticalLines` / `showPageIcons` on the
  active view's config, both absent = shown), Source section (local info, or the connector sync controls
  below), a Row pages status item (a real menu item so it aligns with sibling rows;
  future template-editor entry point), two-step Delete database, stats footer (fields,
  rows, plus Size — the row shard's UTF-8 byte size — and "Loads in" — the shard's
  JSON parse time measured fresh on each menu open). The per-view sections (Properties
  visibility, Group, Vertical separators) all write to the ACTIVE view threaded from the
  title row — never `views[0]`. **Delete database** (`deleteDatabase`) removes the
  definition + rows, then invokes the block's `onDeleted` hook so the hosting `database`
  block removes ITSELF through the canvas command bus (an undoable `row.delete`) rather
  than leaving a "not found" shell — a deleted database has nothing to render. Blocks
  referencing a database deleted elsewhere (another block/tab) show a "This database was
  deleted." state with a **Remove** action (edit mode) instead of a bare message.

### Per-view options (in the ⋯ menu)

Every view's display settings live in the ⋯ settings menu — there is **no** floating
config control on any view. The menu adapts to the active `view.type`:

- **Group** (`view.groupBy`) shows for **table/list only** — grouping drives the grid /
  list render. Board columns and chart axes have their own drivers, so Group is hidden
  for them (it would silently do nothing).
- **Board options** ([`database-board-config.tsx`](../../src/components/database/views/database-board-config.tsx),
  `BoardOptionsItems`): **Group by** (which select field's options become columns —
  `board.groupFieldId`), **Column order** (`board.columnSort`: `manual` = option order,
  `alphabetical`, or `color` = palette order, name-tiebroken, colorless last —
  `buildBoardColumns` applies it; the "No &lt;field&gt;" column stays last regardless),
  **Hide empty columns** (`board.hideEmptyColumns` — drops card-less columns from
  display, distinct from the per-column manual hide's unhide chip), and **Card
  properties** (`board.cardFieldIds` toggles, seeded from the resolver's default).
- **Chart options** ([`database-chart-config.tsx`](../../src/components/database/views/database-chart-config.tsx),
  `ChartOptionsItems`): the full chart config — mark (bar/line/area/pie), X axis, Y
  aggregate + property, series split, legend + position, stacked, grid, palette, and
  per-series/slice color overrides. The color-override rows need the resolved
  series/category keys, so `DatabaseTableView` computes `buildChartData` once for chart
  views and threads it through `DatabaseTitle` → `DatabaseSettingsMenu` (`chartData`
  prop). Writes shallow-merge into `config.chart` / `config.board` via
  `updateDatabaseView` (JSON round-trip drops `undefined` keys).

## Connector sync

Synced databases pull rows from an external service via the client-side engine in
[`database-sync-engine.ts`](../../src/db/sync/database-sync-engine.ts) (Web Locks leader
election, per-database scheduling clamped to connector minimums, push-based
`subscribeSyncStatus`, and **watch mode** — see below) over the connector SDK in
[`src/lib/connectors/`](../../src/lib/connectors/) (registry `listConnectors`/
`getConnector`; GitHub repos, CoinGecko markets, Frankfurter FX). Snapshot diffing lives
in [`database-sync-ops.ts`](../../src/db/queries/database-sync-ops.ts): keyed by
`externalId`, touching only `sourceKey` field values so local columns survive refreshes.

UI surfaces:

- **Creation** — the unlinked database block's placeholder opens a popover panel
  ([`database-create-panel.tsx`](../../src/components/database/database-create-panel.tsx)):
  **New table** (default local seed) and **Sync from source** tabs. The sync tab lists
  connector cards (icon/title/description from the registry); picking one renders a form
  generated from `configFields` ("list" inputs parse comma/newline-separated values;
  empty text inputs are omitted so schema defaults apply), validated by the connector's
  zod `configSchema` with inline `FieldError`s. Connectors with `auth` add a masked token
  input persisted via [`token-store.ts`](../../src/lib/connectors/token-store.ts)
  (client-only localStorage — never in the database config). Submit builds
  `buildSyncedDatabaseSeed` → `createDatabaseWithDefaults`, links the block, and fires a
  best-effort `requestImmediateSync` (the engine also adopts the database via its
  collection subscription).
- **Watch mode** — mounting any view of a synced database (edit mode and published
  view mode alike) registers `watchDatabaseSync(databaseId)` from
  [`database-table-view.tsx`](../../src/components/database/database-table-view.tsx)
  (ref-counted; unsubscribe on unmount). While a database has ≥1 watcher AND the tab
  is visible AND it is the polling leader, its interval becomes the connector floor
  (`pollPolicy.minMs` via [`resolveWatchedInterval`](../../src/db/sync/sync-schedule.ts))
  instead of `source.refreshMs`/`defaultMs`, and watch start kicks an immediate pass
  when the last attempt is older than the watched interval. Unwatching restores the
  configured cadence. Failure backoff always wins over acceleration; follower-tab
  watches are engine no-ops v1 (rows arrive via storage events — a cross-tab nudge is
  the sketched upgrade).
- **Status chip** — [`use-sync-status.ts`](../../src/hooks/use-sync-status.ts)
  (`useSyncExternalStore` over `subscribeSyncStatus`) drives the title-row chip, now a
  minimal glyph with **no relative-time label** (tables update live under watch mode;
  diagnostics moved to Settings → Source): spinner while syncing, destructive dot +
  message tooltip on error, tiny muted refresh glyph when idle+healthy. Click =
  `requestImmediateSync` ("Refresh now" tooltip); a refused click (follower tab —
  leader-only by design) switches the chip to a no-op look.
- **Settings → Source** — connector identity + config summary, last sync/error, Refresh
  now, refresh-interval override submenu (Default/1m/5m/15m/1h/6h → `updateDatabaseSource`
  writes `source.refreshMs`; connectors clamp to their minimum), and the token row for
  auth connectors.
- **Read-only enforcement** — `isSyncedField` (`sourceKey` present) gates
  `isInlineEditableField` (the single edit-mode gate in
  [`database-grid-helpers.ts`](../../src/components/database/database-grid-helpers.ts));
  synced checkbox cells render disabled; view-mode rendering is unchanged. The column
  menu shows a cloud "Synced" badge and hides Change type / Edit property and disables
  Delete property (rename/icon/sort/calculate/freeze/hide/wrap stay; Duplicate yields a
  **local** copy — `duplicateDatabaseField` strips `sourceKey`). Add-field stays enabled
  on synced tables (local columns are first-class); the "New row" strip is hidden, and
  `deleteDatabaseRows` skips rows with `externalId` (they would respawn on the next
  sync).

## Formula fields

Formula values are computed at **read time** — never stored in `row.values`.
[`formula-values.ts`](../../src/lib/databases/formula-values.ts) is the pure overlay:
`computeFormulaOverlay(fields, rows, { now? })` parses each formula's expression once
per call (`lib/expr` engine), evaluates per row via `createRowScope`, and records
`{ cellValue, display, isError }` per cell (`exprValueToCellValue` /
`exprValueToDisplay`). `withFormulaValues` merges the results into row **copies**
(inputs never mutated; parse-error and blank expressions yield `null` cells, shadowing
any stale stored values under the field id). `database-table-view.tsx` feeds these
merged rows to the whole pipeline — filter, sort, group, Calculate row, and the grid —
so formulas participate in the view machinery like stored columns:

- **Coercion** — `coerceCellValue`'s formula case passes scalar string/number/boolean
  through; everything else reads as empty.
- **Error transport** — evaluation errors collapse to `null` for the machinery, and the
  "⚠ …" display travels through the merged value as a single-element string-array
  marker decoded only by the formula cell renderer (`formulaCellErrorDisplay`); cells
  render it as muted text with a title tooltip. Merged rows are ephemeral render
  inputs — markers are never persisted.
- **Display** — formula cells are read-only (`isInlineEditableField` excludes formula):
  numbers right-aligned tabular-nums, booleans "Yes"/"No" text, strings plain.
- **Filtering** — string operator set (`FIELD_TYPE_DEFS.formula`) over the computed
  value; **mixed-type formula columns filter as strings v1** (number results satisfy
  emptiness operators but not text matches). Sorting compares same-type pairs natively,
  mixed pairs by text collation. Numeric Calculate reducers (sum/average/…) work over a
  formula column's number-typed results; grouping stays excluded (`isGroupableField`).
- **Volatile clocks** — when any expression uses `now()`/`today()`
  (`hasVolatileFormula`), the table view re-evaluates every 60s, pausing while the tab
  is hidden and refreshing on visibility return.
- **Editing** — the column menu's Edit property submenu becomes a formula **builder**
  ([`formula-editor-panel.tsx`](../../src/components/database/formula-editor-panel.tsx),
  width-fluid for the desktop submenu and the touch menu drawer alike): monospace
  expression textarea with live parse feedback (positioned error / "✓ Valid") and a live
  first-row preview, over a searchable Properties / Functions / Operators reference
  (docs sourced from [`function-catalog.ts`](../../src/lib/expr/function-catalog.ts),
  drift-tested against the evaluator) that inserts at the caret, plus an explicit Save;
  broken expressions show a warning badge on the column header (`formulaDisplayInfo`).
  Formula→formula references are per-cell errors v1 (cycle safety without a dependency
  graph); the dependency-DAG upgrade is sketched in `createRowScope`'s docs.

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
shared placeholder trigger opening the creation popover (New table / Sync from source —
see [Connector sync](#connector-sync)); it auto-opens on block autofocus, mirroring the
media/embed pickers. Deleting a database block does **not**
delete the database entity (blocks are references; entity lifecycle UI is future work).
`props.viewId` holds the block's saved-view pick (absent/stale → first view): the edit
component persists switcher changes through `onChange`, the view component passes
`viewId` read-only — several blocks can show DIFFERENT views of the SAME database.

## Dashboards

Dashboards are a **composition pattern**, not a block type: place `database` blocks —
each with its own `viewId` (chart here, board there) and/or different databases —
inside a `columns` layout. The slash menu's **Dashboard** entry scaffolds this: a
2-column `columns` block with one unlinked `database` placeholder per column
(`columns.create` with `seedChildType: "database"`, see
[canvas-commands](../reference/canvas-commands.md)); the first placeholder is focused,
auto-opening its create/link picker. From there, link a database per column and pick
each block's view with the title-row switcher.

## Review-hardening invariants

Post-review guarantees worth knowing when editing this area: the expression
parser enforces length/depth caps so `parseExpression` never throws (hostile
synced cell text cannot crash render); formula columns filter on their
displayed text; multiSelect plain text joins in field-option order so
Calculate/sort/grouping agree; the editing grid row is pinned into the virtual
range (scrolling never unmounts an open editor); sync meta persists a new ETag
only after the row-apply commit resolves; hidden leader tabs resign the sync
lock within ~5s so a visible tab polls; config/auth connector errors halt
polling until the source or token changes; GitHub connectors follow Link
pagination (3 pages, page-1 conditional GET); duplicated select fields
regenerate option ids and remap copied row values.

## Row pages (virtual + copy-on-write)

Every row "has" a page with **zero per-row storage**: the `/db/$databaseId/$rowId`
route ([`db.$databaseId.$rowId.tsx`](../../src/routes/db.$databaseId.$rowId.tsx),
client-only — SSR renders a neutral shell like `/p/$`) renders
[`DatabaseRowPage`](../../src/components/database/row-page/database-row-page.tsx):
title = primary field value, a properties panel reusing the grid's cell editors
(local fields inline-editable, synced fields read-only, formulas computed), and a body
instantiated per render from the shared `database.rowTemplate` via
[`instantiateTemplateBlocks`](../../src/lib/databases/row-template.ts) —
`{{ thisPage.X }}` tokens in text-bearing props (`text`, tab `label`, embed `caption`;
`code` stays literal) evaluate through `evaluateTemplateText` + `createRowScope`,
rendered read-only with `CanvasBlocksReadOnly`. Absent template = one **empty** text
block, so a row with no custom template opens as a normal blank page — there is
deliberately no "Edit page" button or placeholder copy. The grid's primary cells show a
Notion-style page icon (the default document glyph, toggled per view by the ⋯ menu's
**Page icons** switch) plus a hover-revealed "Open" pill (both modes) navigating there;
the ⋯ settings menu shows the template status (authoring UI is deferred).

**Copy-on-write:** the first body click instantiates the template
(a snapshot — live tokens inside real pages are a future phase), remaps ids
(`clonePageBlocks`), creates a REAL user page via `page.create`, links it with
`setDatabaseRowPageId(rowId, pageId)`, and navigates. The page's `parentId` is the
database's **host page**, resolved by
[`resolveDatabaseHostParentId`](../../src/lib/databases/resolve-database-host-page.ts):
scan `localBlocksCollection` for `database` blocks referencing the database (pristine
shipped pages are out of scope — every UI flow has the host's blocks in the local
shard), pick the lexicographically smallest hosting `pageId` across linked views
(deterministic), and walk up ancestors when nesting would exceed `MAX_PAGE_DEPTH`;
top-level (`null`) only when no host exists (unreachable via the UI). The page also
carries **`databaseRowSource: { databaseId, rowId }`** (threaded
`page.create` → `page.persist` → `localPagesCollection`), which **hides it from the
sidebar tree entirely** — the database's own sidebar entry is the navigation surface
(see [pages — Page list](./pages.md#page-list)); the page stays resolvable for
routing, search, and breadcrumbs. Subsequent opens of the row URL redirect to the
page; a dangling `pageId` (page deleted) falls back to the virtual render.

**Sidebar presence:** the sidebar shows a synthetic child row under each page hosting
a `database` block — database icon (`IconDatabase` fallback) + name, navigating to
the HOST page v1 (scroll-to-block later). Built by
[`page-list-database-rows.tsx`](../../src/components/pages/page-list-database-rows.tsx)
(live block/database collection scan, client-only — rows appear after hydration);
no context menu, drag, or chevron on the row itself.

**Row-page breadcrumb:** the row page header renders the full
**host-page ancestors / host page / database / row** chain, mirroring the normal page
header. [`findDatabaseHostPageId`](../../src/lib/databases/resolve-database-host-page.ts)
(the raw host page — the sibling of `resolveDatabaseHostParentId`'s depth-clamped
create-parent) resolves the page whose canvas holds the `database` block; its
ancestors and itself render as navigable [`PageBreadcrumbAncestorCrumb`](../../src/components/pages/page-breadcrumb-ancestor-crumb.tsx)
crumbs (sibling/children hover menus included), then a database crumb linking back to
the host page, then the current row title. Collapses to database / row on narrow
viewports; falls back to a non-navigating database crumb only when no host page is
resolvable.

## Deferred (see proposal phases)

Row drag-reorder UI (table grid — board card drag shipped),
row-page template authoring UI and live tokens
(virtual pages + copy-on-write with host-page nesting shipped — see
[Row pages](#row-pages-virtual--copy-on-write)), sidebar database-row
scroll-to-block navigation, relations/rollups,
formula-aware typed filter operators and formula→formula references,
gallery view (multi-view switching, `viewId` threading, and list/board/chart views
shipped — see [Table view](#table-view)), workspace backup inclusion, SQLite scale tier, keyboard
Tab-into-cell entry, on-screen-keyboard layout testing. Connector sync: realtime/push
connectors, the follower-tab watch nudge (cross-tab "poll faster" ping to the leader),
the server proxy route, and a `/settings` Connections panel.
