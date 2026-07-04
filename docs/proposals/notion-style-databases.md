# Proposal: high-performance Notion-style databases with client-side external sync

> Status: **proposal / research** — nothing in this document is implemented yet.
> Companion reading: [local-first-persistence](../architecture/local-first-persistence.md),
> [block-types](../architecture/block-types.md), [table-blocks](../architecture/table-blocks.md),
> [pages](../architecture/pages.md).

This proposes adding full databases — structured tables with typed fields, multiple views,
optional per-row nested pages — that also work as **high-performance lookup tables**, plus a
**client-side sync engine** that keeps databases live-synced to external services (GitHub,
market data, and other public APIs) with no dedicated backend.

It is grounded in four research passes: a full architecture audit of this codebase, the
current state of TanStack DB (v0.6, July 2026), the browser-callability/CORS/rate-limit
realities of candidate external APIs, and the data models of Notion / Airtable / Grist /
Baserow plus the incremental-computation literature.

---

## 1. Why this app is already 80% of the way there

The audit found the hard substrate already exists:

- **Block system.** Custom registry + command bus (`src/components/blocks/registry.ts`,
  `src/lib/canvas/commands.ts`); adding a block type touches exactly three places
  ([Adding a block type](../architecture/block-types.md#adding-a-block-type)). The
  `composite` edit strategy is already reserved for config-driven blocks like this.
- **Nested pages.** `parentId` + `pageLink` + `/p/{slug}` routing already exist — a row's
  nested page is a user page, not new infrastructure.
- **Reactive data layer.** TanStack DB collections with live queries power every canvas
  render today; `@tanstack/query-db-collection` is installed but **unused** — it is exactly
  the seam for API-backed synced collections.
- **Proven proxy pattern.** `routes/api/unsplash/search.get.ts` is the template for a
  server-held-secret, CORS-free third-party proxy.
- **Rendering.** TanStack Virtual (used in `grid-picker.tsx`), Recharts + chart palettes,
  and the `table` block family's interaction patterns (column resize/reorder, add-row
  strips, structure handles) are all reusable.

The two genuinely new pieces: **(1)** a typed-field, multi-view database model with its own
storage (not blocks), and **(2)** a connector/sync engine + hardened proxy.

## 2. Core design decisions

### 2.1 Databases are workspace entities; blocks are views into them

A database is **not** a block subtree. It is a first-class entity (like a page) with its own
collections. A new `database` **block** merely references one:

```ts
databasePropsSchema = {
  databaseId: string,
  viewId?: string,        // which saved view this block shows
  presentation: "inline" | "fullPage",
}
```

This one decision buys: linked views (the same database embedded on several pages, Notion's
linked databases), full-page databases (a page whose canvas is a single full-width database
block), and — critically — **rows never enter the block tree**, so canvas rendering,
snapshots, and per-keystroke block transactions are untouched by 50k-row tables.

Research is unambiguous here: Notion's everything-is-a-block storage is *why* its databases
are slow (their own mitigation is capping views at 10–25 visible rows), while Grist/Baserow
store rows as flat real tables and stay fast. We copy the flat-table camp.

### 2.2 Storage: three collection kinds, one query surface

| Collection | Contents | Persistence |
|---|---|---|
| `localDatabasesCollection` | Database definitions: fields, views, source config | localStorage (`site-local-databases`) — small, like page metadata |
| Per-database **rows collection** (local databases) | One row per record | localStorage shard `site-local-db-rows:<databaseId>` (Phase 1) → SQLite-WASM/OPFS persisted collection for big tables (Phase 5) |
| Per-database **rows collection** (synced databases) | Rows pulled from an external API | `queryCollectionOptions` + TanStack Query cache; external service is the source of truth |

- Local-database rows reuse the exact sharded-storage pattern of
  `site-local-blocks:<pageId>` (`page-sharded-block-storage.ts`) — per-database shards,
  cross-tab `storage` events, quota-error surfacing via `reportPersistenceError`, workspace
  zip backup all come along for free.
- localStorage is honest up to roughly the low tens of thousands of rows (~5 MB cap,
  synchronous JSON). That is fine for Phase 1 hand-authored tables. The scale tier is
  TanStack DB 0.6's official persistence — `persistedCollectionOptions()` from
  `@tanstack/browser-db-sqlite-persistence` (wa-sqlite over OPFS) — which is also exactly
  the architecture Notion itself shipped in the browser (SQLite-WASM + OPFS +
  Web-Locks-based single writer, 20–33% faster navigations). We adopt it per-database when
  a table crosses a row/byte threshold, not globally.
- Synced rows are **re-fetchable state, not user data**: the TanStack Query layer (already
  wired into the router) caches them; optional persistence is a later nicety. They never
  bloat workspace backups.

### 2.3 Field model: stable ids, typed values, Notion's taxonomy without its storage

```ts
// lib/schemas/database.ts (new)
databaseFieldSchema = {
  id: string,              // stable nanoid — display name lives here, never in row data
  name: string,
  type: "text" | "number" | "checkbox" | "select" | "multiSelect" | "date" |
        "url" | "relation" | "rollup" | "formula" | "createdAt" | "updatedAt",
  config: per-type,        // number format, select options {id,name,color}, relation target
                           // databaseId, rollup {relationFieldId,targetFieldId,fn}, formula src
  indexed?: boolean,       // opt-in BTreeIndex, see §3
}

databaseRowSchema = {
  id: string,
  databaseId: string,
  values: Record<fieldId, CellValue>,   // validated per-field, sparse
  order?: number,                       // sparse manual sort key (sidebarOrder pattern) —
                                        // powers drag-reorder when a view has no sorts
  pageId: string | null,                // nested page, lazily created (§2.5)
  externalId?: string,                  // connector row identity (§4)
  createdAt / updatedAt: string,
}
```

Rules stolen deliberately:

- **Stable field ids as keys** (Baserow's `field_{id}`, Grist's col ids): renaming a column
  is a metadata edit, never a row rewrite. Airtable's name-based formula references are the
  cautionary tale.
- **Exactly one primary/title field** (Notion invariant) — it names the row's nested page.
- Select options are `{id, name, color}` objects with the app's existing color tokens.
- Relation values store target row ids; rollup/formula fields are **computed, never stored
  in `values`** (§3.3).
- **Text cells are mini rich text, not plain strings.** The `text` cell value is a
  constrained rich document — inline marks (bold, italic, code, links) plus flat bullet
  list items — stored as a small span/line array, *not* canvas blocks (cells never enter
  the block tree; §2.1's flat-storage rule holds). Filtering/sorting operate on a derived
  `plainText` projection so text cells stay indexable. The editing surface reuses
  `EditableSurface` conventions with a minimal mark toolbar; "turn into full page" (§2.5)
  is the escape hatch when a cell wants real blocks.

### 2.4 Views: first-class saved lenses on the definition

```ts
databaseViewSchema = {
  id, name,
  type: "table" | "board" | "gallery" | "list" | "chart",
  filter?: FilterGroup,        // Notion's grammar: and/or groups, max 2 nesting levels,
                               // per-type operator sets (contains, equals, before/after, …)
  sorts?: { fieldId, direction }[],
  groupBy?: { fieldId, granularity? },
  visibleFieldIds?: string[],
  config: per-type,            // table: columnWidths, frozen col; board: group field;
                               // chart: mark type + x/y/series field mapping
}
```

Notion's just-shipped Views API validated this exact shape (per-view filter/sorts/
quick-filters/configuration objects); we adopt the schema without the server. The
**2-level filter nesting cap is a feature** — it keeps the filter → live-query compiler
trivial and the UI sane. Filters compile to TanStack DB `where` expressions (indexable);
sorts to `orderBy`; groupBy to `groupBy` — all incrementally maintained.

View components map onto existing furniture: the table view is a **ShadCN data table —
TanStack Table (headless) + design-system cells — heavily modified** per §5.1, virtualized
with TanStack Virtual (rows *and* columns) over windowed queries; board = group-by live
query + existing DnD toolkit (`lib/dnd/`); gallery/list are simple layouts; chart view
feeds a live query straight into Recharts with the existing `--chart-*` palettes. TanStack
Table earns its seat for exactly the features we need built-in — column pinning, sizing,
ordering, visibility, and footer aggregation state — while staying 100% headless so every
cell is a design-system component; canvas grids (Glide) are rejected — they abandon the
design system and still lack React 19 support. Sorting/filtering/pagination run in
**manual mode**: TanStack Table owns *view state*, TanStack DB's indexed live queries own
*data computation* — the grid never sorts or filters arrays itself.

### 2.5 Nested pages per row — optional and lazy

`row.pageId` is `null` until the user first opens the row as a page. On first open we
`page.create` a real user page (parented under the database's host page, `/p/{slug}`
routing, `MAX_PAGE_DEPTH` respected) and link it. Row properties render as a header section
on that page (same join at render time — properties are never merged into block storage).
Deleting a row cascades via the existing `page.delete`; deleting the page resets
`pageId → null` (or deletes the row — decided in implementation).

This is "rows are pages" as a **join, not a merge** — pure-lookup-table databases pay zero
page overhead, which is precisely the "not all databases need nested pages" requirement.

## 3. Performance architecture

The budget: **10k rows totally fluid on every interaction; 100k rows usable; view size, not
table size, bounds render cost.**

### 3.1 The query engine is already fast — feed it correctly

TanStack DB live queries are differential-dataflow pipelines: the published benchmark is
~0.7 ms to update one row in a *sorted 100k-row collection* (M1 Pro), with joins, groupBy
and aggregates maintained incrementally. Our obligations:

- **Explicit indexes.** `collection.createIndex()` with `BTreeIndex` on every field used in
  a view filter/sort and every field marked `indexed` (O(1) equality, O(log n) range;
  `autoIndex` defaults to off in 0.6 — we index deliberately).
- **Windowed reads.** Views query with `orderBy + limit/offset` (incremental top-K); the
  grid virtualizer pulls windows, never the whole table.
- **Precomputed sort keys.** `orderBy` on a computed expression defeats the top-K lazy
  path — sorting on formula/rollup columns sorts a materialized value (§3.3), never an
  inline expression.
- **Declarative-only filters** on hot paths: `fn.where`/`fn.select` bypass the optimizer and
  indexes; the filter-grammar compiler emits only indexable `eq/gt/lt/in/and/or`.

### 3.2 Lookup-table API

The "high-performance lookup table" use case is served directly by collection primitives,
exposed through a small façade (`lib/databases/lookup.ts`):

- `getRow(databaseId, rowId)` — O(1) keyed `Map` access, no index needed.
- `lookupRows(databaseId, fieldId, value)` — O(1)/O(log n) via the field's BTreeIndex.
- `useDatabaseLookup(...)` — live-query wrapper so any block/page/chart can subscribe to a
  keyed slice and re-render only on relevant deltas.
- Cross-database joins ride TanStack DB's equality joins; `includes()` (0.6) gives
  hierarchical row + related-rows reads in one subscription.

This makes a database usable as a reference table from anywhere in the app (e.g. a future
inline `lookup("Tickers", "AAPL").price` token in text blocks) without new machinery.

### 3.3 Computed fields: dependency DAG, materialized values, cutoffs

For rollups and formulas we follow the Grist/Excel/Salsa consensus rather than inventing:

- **Column-level dependency DAG** with per-row dirty sets: formula field → referenced
  fields; rollup field → (relation field, target field, aggregate fn). Cycles are detected
  and surfaced as field errors.
- **Materialize computed values** into a side-collection (`site-local-db-computed:<dbId>` /
  in-memory for synced DBs), recomputed topologically with **equality cutoffs** (a row edit
  that doesn't change a SUM stops propagating). SUM/COUNT/AVG maintain by delta; MIN/MAX
  re-aggregate only the affected group on delete (IVM rules).
- Where a rollup is expressible as a live query (`join + groupBy + sum`), we let TanStack DB
  maintain it and only fall back to the DAG for chained formula→rollup→formula cases;
  `createEffect` (0.6) triggers DAG recompute off live-query deltas.
- **No volatile functions in the graph.** `now()`-style formulas recompute on a visible
  clock tick, not as dependencies — Airtable's documented #1 self-inflicted perf wound.

Formula *fields* ship **late** (Phase 6), but the expression language itself arrives
earlier: inline tokens (§5.3) build the shared parser/typechecker/evaluator in Phase 4 and
battle-test it on single values, so Phase 6 adds column semantics (per-row evaluation, the
dependency DAG, materialization) to an engine that already works.

### 3.4 Rendering

Table view = DOM + TanStack Table (headless, manual mode) + TanStack Virtual (both axes),
design-system cells, sticky header + pinned columns, `content-visibility` where cheap
(full spec in §5.1). DOM-with-virtualization is fully sufficient below ~50k *loaded* rows
with rich cells, and windowed queries mean we never load more than the viewport ±
overscan anyway. The grid never sorts/filters/aggregates arrays itself — TanStack Table
holds view state only; computation stays in indexed live queries. Editing, selection,
keyboard, and DnD reuse the `table` block's established patterns and the shared DnD
toolkit.

## 4. External sync: client-side connectors

### 4.1 What research established

- **GitHub is the flagship browser connector.** `api.github.com` sends
  `Access-Control-Allow-Origin: *` (probe-verified) and exposes `ETag`, `Link`, and all
  `X-RateLimit-*` headers cross-origin. Unauthenticated = 60 req/hr/IP (and 2025's
  anti-scraper enforcement makes anonymous polling fragile). With a user-supplied
  fine-grained PAT (public-read-only, zero account permissions): 5,000 req/hr **and 304
  responses to conditional requests are free** — authenticated ETag polling costs quota
  only when data actually changed. Events endpoints supply `X-Poll-Interval`; the
  contribution graph is GraphQL-only (auth required) — v1 ships repos/profile/events/gists,
  not the contribution calendar.
- **Strong zero-backend lineup** (open CORS, generous/keyless free tiers): CoinGecko
  (crypto), Frankfurter (FX, keyless), Open-Meteo (weather, keyless), Hacker News (Firebase
  — true push, no polling), npm / PyPI / crates.io (PyPI even exposes a change-serial
  cursor), Wikipedia/Wikidata.
- **Stocks:** Yahoo Finance is a dead end (CORS-blocked + crumb auth + ToS). **Finnhub** is
  the pick: 60 calls/min free and — decisively — a **free WebSocket for real-time US
  trades, and WebSockets are never subject to CORS**. Its REST CORS status has conflicting
  reports → build-time smoke test with proxy fallback. Alpha Vantage (25 req/day) is
  manual-refresh-only tier; Polygon/Massive 5/min EOD works for small watchlists.
- **RSS/arbitrary feeds are the one connector class that requires the proxy** (feeds almost
  never send CORS headers).
- **Prior art check:** Notion/Airtable/Glide all do external sync *server-side* on
  multi-minute schedules. A browser-side engine is genuinely differentiated — and viable,
  because the coordination patterns (Web Locks leader election, visibility-aware refetch,
  conditional requests) are all standard platform APIs.

### 4.2 Connector SDK

```ts
// lib/connectors/define-connector.ts (new)
defineConnector({
  id: "github-repos",
  title, icon,
  configSchema,                    // zod: e.g. { username }, { symbols[] }
  auth?: { kind: "token", help },  // BYO token, stored locally only, never bundled
  fields: (config) => DatabaseField[],        // canonical schema for this connector
  fetch: async (ctx) => ({ rows, cursor? }),  // ctx: config, token?, etag store, fetch
  pollPolicy: { min, default, honors?: "X-Poll-Interval" | "Retry-After" },
  realtime?: (ctx, emit) => unsubscribe,      // e.g. Finnhub WS, HN Firebase stream
})
```

A synced database = `source: { kind: "connector", connectorId, config, refreshMs }` on the
database definition. Its rows collection is a `queryCollectionOptions` collection, and the
division of labor across the three layers is strict:

| Layer | Owns |
|---|---|
| **TanStack Query** | Fetch lifecycle: cadence (`refetchInterval`), focus/reconnect refetch, retry/backoff, `staleTime`/`gcTime`, dedup |
| **TanStack DB query collection** | Synced row state: the `queryFn` result is treated as **complete state** and internally diffed into insert/update/delete deltas keyed by `getKey: (row) => row.externalId` |
| **TanStack DB live queries** | Everything downstream: view filters/sorts/groupBy, footer aggregates, joins against local overlays and other databases — all incrementally maintained off the deltas |

Consequences worth being precise about:

- We do **not** hand-diff on the polling path — the query collection's complete-state
  reconciliation does it. Our connector-level diff logic exists only where the
  complete-state contract needs help: paginated/truncated fetches merge with prior rows
  *before* returning from `queryFn`, and delete-tombstoning applies a
  seen-in-last-N-syncs grace period (implemented by re-including recently-missing rows in
  the returned snapshot) so partial responses don't flap deletes.
- **Incremental pushes (WebSocket ticks, HN Firebase events) bypass Query** and write
  straight into the synced store via the query collection's `writeBatch`/`writeUpsert`
  utils — the documented path for streaming updates — so a price tick is one keyed upsert
  flowing through differential dataflow to exactly the cells/aggregates that depend on it,
  never a refetch.
- UI components **never consume `useQuery` for synced rows** — they consume live queries
  on the collection, same as local databases. One query surface everywhere.
- Full-snapshot polling is right for v1 connector payloads (a repo list, a watchlist).
  If a connector ever serves large server-filterable datasets, the query collection's
  `syncMode: 'on-demand'` (predicate push-down into `queryFn`) is the designed escape
  hatch — noted, not planned.

**Synced + local composition:** synced fields are read-only, but users can add **local
fields** to a synced database (notes, tags, checkboxes) stored in a local overlay collection
keyed by `externalId` and joined in the live query — something Notion's synced databases
can't do, and a natural fit for equality joins.

### 4.3 Sync scheduler (the client-side "backend")

One new module under `src/db/` (proposed name: `sync/`) owning all polling:

- **Leader election via Web Locks** (`navigator.locks`) so exactly one tab polls per
  connector regardless of open tabs — mandatory when limits are per-IP/per-key, and the
  same primitive Notion uses for its SQLite writer. **Cross-tab fan-out is explicit, not
  assumed:** TanStack Query's cache is per-tab, so the leader broadcasts applied row
  deltas over a `BroadcastChannel` and follower tabs apply them via `writeBatch` into
  their own collections (plus one full-snapshot request/reply on follower boot). Leader
  preference goes to a **visible** tab (re-elect on `visibilitychange`) so polling isn't
  hostage to a backgrounded tab's clamped timers.
- **Visibility-aware cadence:** TanStack Query defaults do the heavy lifting
  (`refetchInterval` pauses hidden, `refetchOnWindowFocus`, `refetchOnReconnect`); design is
  "catch up on focus," not "always-on background," since browsers throttle hidden timers
  anyway. `refetchInterval` is passed as a **function**, which is exactly where the
  rate-budget arithmetic below plugs in.
- **Conditional requests:** per-endpoint `{etag, lastModified, cursor, snapshotHash}`
  persisted in `idb-keyval` (alongside the existing asset store). On 304: nothing to do.
- **Rate-limit budgeting:** adaptive interval from response headers —
  `interval = max(pollPolicy.min, (reset − now) / (remaining × share))` — plus honoring
  `Retry-After`/`X-Poll-Interval`, exponential backoff with jitter on 403/429, and a
  persisted token bucket per provider so reloads don't reset budgets.
- **Status surfacing:** per-database sync state (last sync, next poll, rate budget, errors)
  via the collections' `$synced`-style metadata → small status affordance in the database
  toolbar; failures route to the existing Sonner error sink.

### 4.4 The proxy: `routes/api/connector-proxy.get.ts`

Same-origin Nitro route, modeled on the Unsplash proxy, used **only** when direct calls are
impossible (RSS) or a shared server-held key is preferable (stingy finance APIs):

- **Connector-scoped allowlist** — `?connector=rss&target=…` with exact/suffix-anchored
  hostname validation per connector; never an open `?url=` relay (public CORS proxies died
  of SSRF — CVE-2020-36851 class).
- **SSRF hardening:** HTTPS only, no IP-literal hosts, `redirect: "manual"` with
  re-validation per hop; GET/HEAD only; forward only `If-None-Match`/`If-Modified-Since`/
  `Accept`; strip cookies both ways; response size cap + timeout; require
  `Sec-Fetch-Site: same-origin`.
- **Edge caching as a feature:** `Cache-Control: s-maxage=60, stale-while-revalidate=300`
  collapses all visitors polling the same public resource into ~1 upstream request per TTL
  — simultaneously the rate-limit multiplier and the key-concealment layer (provider keys
  injected from env vars, Unsplash-style).

### 4.5 Tokens & keys

- **BYO tokens** (GitHub PAT, Finnhub key) are entered by the user, stored client-side
  only (localStorage/IndexedDB via a small `lib/connectors/token-store.ts`), never shipped
  in the bundle, never sent to our server. Scope guidance in the connector UI
  (public-read-only PAT); token-expiry surfaced as a sync error state.
- **Shared keys** (if we ever want e.g. Alpha Vantage without user setup) live only in
  Vercel env vars behind the proxy.

## 5. UX specification

### 5.1 Table view: ShadCN data table, heavily modified

The grid is a ShadCN-style data table on **TanStack Table (headless) + TanStack Virtual**,
with all data computation delegated to TanStack DB (manual sorting/filtering/pagination
mode). TanStack Table contributes exactly the state machines we'd otherwise hand-roll —
`columnPinning`, `columnOrder`, `columnSizing`, `columnVisibility`, row selection, footer
aggregation — while every rendered element stays a design-system component.

**Interaction spec:**

- **Row drag-reorder.** Grip handle in the row gutter (same reveal/tooltip/cursor grammar
  as canvas rows and the `table` block's structure handles); reorder writes the sparse
  `row.order` key (sidebarOrder pattern — no full-table rewrites). Manual reorder is
  available only when the active view has no sorts (Notion's rule); with sorts active the
  grip offers "remove sorting to reorder". Powered by the shared DnD toolkit
  (`lib/dnd/` + `components/dnd/`) with a full-width `bg-selection-primary` drop line,
  matching the established table-block conventions.
- **Column drag-reorder.** Header-mounted drag via the same toolkit writing per-view
  column order (`view.config.columnOrder` ≙ TanStack `columnOrder` state); full-height
  drop indicator; DnD wrapper stays outside the `<table>` element (hard-won rule from the
  table block — see [table-blocks](../architecture/table-blocks.md)).
- **Column pinning with scroll fades.** Freeze from the column menu or drag-into-pinned
  zone; TanStack `columnPinning` state renders pinned columns `position: sticky` with the
  scrolling region between them. The boundary uses the app's existing scroll-fade
  primitive — the horizontal analogue of `.scroll-fade-y` driven by
  `--scroll-area-overflow-*` custom properties (`components/ui/scroll-area.tsx`): content
  fades under the pinned edge only once there is actual overflow, first column stays
  opaque at rest, and the fade tracks scroll position exactly like our ScrollAreas. Pinned
  state is per-view (`frozen_column_index` in Notion's view config — we store
  `pinnedFieldIds`).
- **Column header menu** (mirrors the Notion property menu): rename-in-place at top with
  field-type icon; **Edit property** (config submenu per type); **Change type** (with
  value coercion rules); **Filter** (seeds a filter chip for this field, §5.2); **Sort**
  (asc/desc, appends to view sorts); **Calculate** (§ below); **Freeze** (pin through this
  column); **Hide** (drops from `visibleFieldIds`); **Wrap content** (per-column wrap vs
  truncate); **Insert left / Insert right**; **Duplicate property**; **Delete property**
  (destructive styling). Built as a `DropdownMenu` following the block-gutter-menu
  section-component pattern.
- **Calculate row.** Per-column footer aggregate picker — none / count all / count values /
  count unique / count empty / count not empty / percent empty / percent not empty, plus
  sum / average / median / min / max / range for numbers and earliest / latest / range for
  dates (Notion's aggregate taxonomy). Each active calculation is one TanStack DB
  `groupBy`-free aggregate live query over the view's filtered row set — incrementally
  maintained, so footer values update on cell edits without rescans. Selection is stored
  per view (`view.config.calculations: Record<fieldId, fn>`).
- **Inline cell editing.** Single click focuses (view mode), Enter/second click edits in
  place; Escape reverts, Tab/Shift+Tab and arrow keys navigate (extending the `table`
  block's `table.focusCell` grammar). Each field type gets a purpose-built inline editor:
  text (mini rich text per §2.3 — bold/italic/code/links + bullet lists via a floating
  mark toolbar), number (formatted input), select/multi-select (combobox popover with
  option creation, `{id,name,color}` pills), date (existing `react-day-picker`), checkbox
  (design-system checkbox), url, relation (searchable row picker popover). Edits commit
  through `database.updateCell` as single-collection transactions — same
  optimistic-write + `reportPersistenceError` path as canvas edits.
- **Virtualization.** Rows and columns virtualized (TanStack Virtual); sticky header and
  pinned columns excluded from the column virtualizer; overscan tuned so keyboard
  navigation never lands on an unmounted cell.

### 5.2 Linear-style filtering

The filter experience is Linear's, not a form builder:

- **Filter chip bar** above the grid: each filter renders as a compact chip —
  `[icon field] [operator] [values] [×]` (e.g. `Status · is any of · ● Active, ● Paused`).
  Clicking any segment edits it in place via popover; operator vocabulary comes from the
  field type's operator set (§2.4 grammar). Multi-value conditions collapse to
  `n selected` with avatars/pills exactly like Linear's `3 assignees`.
- **Add-filter flow:** `+` chip (and `F` hotkey via TanStack hotkeys) opens a command-menu
  style picker — type-ahead over fields, then operator, then value — optimized for
  keyboard-only entry.
- **Match all / any toggle** at the bar's right edge switches the root group `and`/`or`
  (Linear's "Match all filters"); a per-chip overflow lets a chip move into a nested
  `or`-group, which covers the grammar's full 2-level nesting without ever showing a
  "query builder" UI.
- **Quick filters** (Notion's `quick_filters`): a view can promote specific fields to
  always-visible chips even when unset.
- **Compilation:** the chip bar is pure UI over the `FilterGroup` schema; every change
  recompiles to an indexed TanStack DB `where` expression. Ephemeral filter state (user
  exploring) lives beside the view's saved filter, with a "Save to view / Reset" affordance
  when they diverge — so shared/linked views aren't mutated by casual exploration.

### 5.3 Inline query language — live tokens in text

Any text-bearing block can embed a live expression that renders as a **chip** or as
**plain live text** and updates through the same live-query machinery as everything else.

**One expression engine, three consumers.** The language core — parser, type checker,
evaluator, dependency tracking — is built once (`lib/expr/`, pure and React-free per the
`lib/*` convention) and consumed by: inline tokens (this section), formula fields (§3.3 /
Phase 6), and eventually computed view configs. Inline tokens are deliberately the *first*
consumer: they exercise the whole engine on single values before formula columns raise the
stakes.

**Syntax.** `{{ … }}` inside any text block. Typed by hand or — the primary path — via
autocomplete: typing `{{` opens a slash-menu-style popover (same filtering/keyboard
conventions) that walks database → row/aggregate → field. Examples:

```
{{ Tickers["AAPL"].price }}
{{ count(Tasks where Status = "Done") }}
{{ sum(Positions.qty * Tickers[Positions.symbol].price) | currency }}
{{ Repos.totalStars | compact }}          → "12.4k"
{{ Tickers["AAPL"].price | delta(1d) }}   → "+1.2%" (needs history capture, §8)
```

- Expression-only, no statements; typed (number/string/boolean/date/row/rowset) with
  errors surfaced in the chip, never thrown.
- References: `Database.field` (single-row DBs / aggregate context), `Database["key"]`
  (primary-field lookup → O(1) via §3.2), `where` clauses reusing the §2.4 filter
  grammar's operator vocabulary.
- Aggregates: the same taxonomy as the Calculate row (§5.1) — `count/sum/avg/min/max/…`
  over a database or a `where`-filtered subset.
- **Format pipes**, not format functions: `| currency | percent | compact | date("MMM d")
  | ago | plain`. Pipes affect display only, never the value's type.
- `now()`/`today()` are volatile → evaluated on the shared clock tick (§3.3 rule), never
  graph edges.

**Rename safety without ugly source.** Sources are human-readable names, but every
reference binds to stable ids (`databaseId`/`fieldId`/row key) at parse time, and the
workspace keeps a **reverse reference index** (token → referenced ids). `database.rename`
/ `database.renameField` commands consult the index and rewrite affected token sources in
the same transaction — the Grist approach, entirely tractable in a single-user local-first
workspace. No Airtable-style silent breakage, no id-soup in the source text.

**Rendering & editing mechanics** (fits the `EditableSurface` native-textarea reality —
no contenteditable migration):

- The **focused** row shows raw source (`{{ … }}`) — exactly like markdown conventions
  elsewhere in the editor; syntax gets a subtle highlight.
- **Unfocused rows and all read-only/view renders** parse the text and render tokens as
  design-system chips (value + tiny source icon; click → popover showing the expression,
  last-updated time, and "Open database") or, with the `| plain` pipe, as unstyled text
  indistinguishable from prose — the "formulas as chips or just normal text" split.
- Copy/paste carries raw source (plain-text portability); tokens survive round-trips
  through any editor.
- **Evaluation**: each distinct expression on a page compiles to one live-query
  subscription; TanStack DB's identical-subquery deduplication means twenty
  `{{ Repos.totalStars }}` chips cost one pipeline. Token updates re-render only the chip
  (memoized span), never the block.
- **SSR/publish**: shipped pages render tokens' last-captured values into the static
  baseline (no layout shift, crawlers see real numbers), then hydrate live — the §8
  published-live-data story applied at word granularity.

### 5.4 Surrounding UX

- **Creation:** slash menu → "Database — Table" (local) and "Database — Sync" (connector
  gallery with config form → TanStack Form + zod, matching `SourceLinkPanel` conventions).
- **Views UI:** view switcher tabs in the database block header (existing `TabsList`
  indicator variant); per-view sort/group controls beside the filter bar, built from the
  field schema.
- **Row page:** open-row affordance on the primary field (Notion's "open as page"),
  breadcrumb inherits the host page.
- **Settings:** connector tokens + sync diagnostics panel under `/settings` (new
  "Connections" section); databases included in workspace zip export/import (definitions +
  local rows; synced rows excluded by design).
- **Commands:** new `database.*` command namespace (`database.create`, `.addField`,
  `.updateCell`, `.addRow`, `.setView`, …) following the reducer/command conventions;
  documented in `docs/reference/` when implemented.

## 6. Phased plan

Each phase ships user-visible value and is independently mergeable.

| Phase | Scope | Key deliverables |
|---|---|---|
| **0 — Foundations** | Schemas + collections + registry stub | `lib/schemas/database.ts`, `localDatabasesCollection`, per-DB sharded rows collections, `database` block registered (composite strategy), lookup façade with indexes |
| **1 — Table view MVP** | Local databases usable end-to-end | ShadCN data table on TanStack Table + Virtual (§5.1): inline cell editors, column header menu, row/column drag-reorder, column pinning with scroll fades, calculate row; field CRUD (text/number/checkbox/select/multiSelect/date/url) incl. mini-rich-text cells; Linear-style filter bar + sorts (§5.2) compiled to indexed live queries; slash-menu creation; backup integration |
| **2 — Rows as pages + relations** | The Notion feel | Lazy `pageId` row pages; relation field + O(1) lookups; linked views (same DB on multiple pages); board/gallery/list views on group-by queries |
| **3 — Connector engine + first connectors** | External sync, zero backend | Connector SDK; sync scheduler (Web Locks leader, visibility, ETag, budgeting); GitHub (repos/profile/events) with BYO PAT; CoinGecko + Frankfurter (keyless demos); local-fields overlay on synced DBs |
| **4 — Real-time, proxy, inline tokens** | "Stock ticker in my page — and in my sentences" | Finnhub connector (REST + free WebSocket via `realtime`); HN Firebase push connector; hardened `connector-proxy` route (RSS connector as its proving case); chart view on Recharts; **expression engine core + inline token language v1** (§5.3: lookups, aggregates, format pipes, autocomplete, rename rewriting) |
| **5 — Scale tier** | 100k-row comfort | `@tanstack/browser-db-sqlite-persistence` persisted collections for large local DBs (auto-suggested past a threshold); windowed-query hardening; perf test page under `/dev` |
| **6 — Computed fields** | Rollups + formulas | Rollup fields (live-query-maintained aggregates); formula fields on the **shared expression engine from Phase 4** (same-row references first, typed, non-volatile); dependency DAG with materialization + cutoffs |

Dependency notes: 3 needs only 0–1; 4 needs 3; 5 and 6 are independent of each other.
Suggested first milestone: **Phases 0–1 in one PR series** (a fast local table block is
already a standalone win), with 3 close behind since it's the differentiating feature.

## 7. Risks & open questions

- **New dependency: `@tanstack/react-table`.** Adopt v8 (stable, React 19 compatible);
  v9 is in beta (tree-shakable rewrite) — migrate when it stabilizes, the state-shape
  surface we use (pinning/order/sizing/visibility) is carried over.
- **TanStack DB pre-1.0.** APIs may shift (SSR support is the stated 1.0 blocker). We're
  already committed to the 0.6 line app-wide, and the collection-options surface has been
  stable across 0.5→0.6; pin + adapt.
- **localStorage ceiling before Phase 5.** A user pasting 50k rows in Phase 1 will hit
  quota; mitigation: row-count guardrail + "this table needs the high-capacity engine"
  upsell path, and quota errors already surface via the persistence-error sink.
- **Finnhub REST CORS ambiguity.** Smoke-test in CI; the WebSocket path and the proxy
  fallback both sidestep it.
- **Synced-row identity drift** (external ids changing, e.g. repo renames): grace-period
  tombstoning covers transients; document that connector identity = provider id.
- **XSS blast radius of stored tokens.** Same class of risk as any client-stored bearer
  token; mitigations: read-only token guidance, optional session-only (in-memory) mode,
  and the site has no third-party script surface today.
- **Open question — where do database definitions live for *shipped* content?** Author dev
  mode should be able to "Save to source" a database (definition + rows → `content/`), so
  the deployed site can ship curated databases the way it ships pages. Proposed: mirror the
  pages model (a new databases folder under `content/`, lazy-seed on first edit) in
  Phase 1.
- **Open question — snapshots/version history for rows?** Page snapshots are per-page;
  per-database history is deferred (Grist's invertible action log is the model if we want
  it later).

## 8. Differentiation: what this does that Notion can't

Raw speed is table stakes. The structural differentiators all fall out of one fact Notion
can never replicate: **this is a deployed site where the visitor's browser is the runtime.**

- **Published pages with *live* data and zero backend.** A Notion public page is a static
  share. Here, a database view on a published page ships its static baseline for
  SSR/SEO/OG — and then **each visitor's browser runs the sync engine** against public
  CORS APIs. Your homepage's GitHub table or ticker board is live *for every visitor*,
  served from a static deploy. No incumbent (Notion, Airtable, Glide) can do this; their
  sync runs server-side on their infrastructure. Requires the author-dev-mode answer from
  §7 (databases shipped in `content/` like pages) plus marking a connector
  `publicSafe: true` (keyless/anonymous-tier APIs only — visitor browsers never see
  tokens).
- **An inline query language.** Any cell, lookup, or aggregate is referenceable from
  prose — "I maintain **{{ Repos.count }}** packages" — rendered as a live chip or as
  plain live text, with format pipes and `where`-filtered aggregates (full spec §5.3).
  Notion has no cell references outside a database. This is the feature that makes
  databases *compose with the canvas* instead of sitting beside it — and its expression
  engine is the same one formula fields use later, so the investment pays twice.
- **Time-series capture: turn any polled field into history.** A connector field can opt
  into `captureHistory` — each sync appends changed values to a compact local series
  (IndexedDB), thinned with the same tiered-retention approach as page snapshots. Star
  counts, prices, download numbers become **charts over time and sparkline cells** from
  data no API hands out retroactively. Notion synced databases overwrite; we can remember.
- **Value joins across databases — including across connectors.** TanStack DB equality
  joins mean cross-database views need no hand-created relations: GitHub repos ⋈ npm
  download counts on package name, a synced ticker table ⋈ a local "my positions" table
  on symbol. Notion relations are manually-linked pages; we join on data.
- **Writable synced databases** (local-column overlay, §4.2): annotate read-only external
  rows with your own status/tags/notes. Notion synced databases are read-only, full stop.
- **Client-side automations.** TanStack DB's `createEffect` fires on live-query
  enter/update/exit — "when a row enters this filtered view, recolor the tile / append to
  a log database / toast." Notion gates automations behind paid plans and runs them
  server-side with minutes of latency; ours are free, instant, and offline-capable.
- **Actual real time.** Tick-to-paint in milliseconds (Finnhub WebSocket → keyed upsert →
  differential dataflow → one cell repaint). Notion's synced databases refresh "within
  minutes."
- **Ownership and portability.** Rows live in the user's browser (localStorage/OPFS),
  export in the existing workspace zip, and BYO tokens never leave the device. There is no
  vendor database. This is a *stance* Notion structurally cannot take.

Priority within the plan: local-column overlays and value joins are free byproducts of the
architecture (Phase 3); inline tokens and time-series capture are small, high-leverage
additions (Phase 4–5 candidates); published-live-data is the headline act and lands with
the author-dev-mode/content-shipping answer.

## 9. Relations & parameterized databases (spec)

> Status: **specced, queued for implementation**. Motivating case: a stock
> portfolio — a local Portfolio database (Symbol, Shares, Cost basis) joined to
> a synced Market database by symbol, with per-row pages that open onto data
> scoped to that row.

### 9.1 Relation field — two binding modes, one type

```ts
databaseFieldSchema += {
  type: "relation",
  targetDatabaseId: string,
  binding:
    | { kind: "links" }        // explicit row links; cell value = string[] of
                               // target row ids (fits the existing cell union)
    | { kind: "match",         // VALUE JOIN: membership is computed, never
        localFieldId: string,  // stored — rows relate when
        foreignFieldId: string } // local[localFieldId] === foreign[foreignFieldId]
}
```

- **`links`** is the Notion shape: a row picker (option-combobox pattern over
  target rows' primary values), pills in the cell, click → row page. Local
  databases only for writes (synced rows stay read-only).
- **`match`** is the synced-data shape and the differentiator: Portfolio.Symbol
  ↔ Market.Symbol relates rows automatically, survives every sync refresh, and
  costs O(1) per lookup via the existing BTree indexes + TanStack DB equality
  joins. No cell storage at all — the relation is a live query.
- Display identical in both modes; `match` cells are non-editable by design
  (edit the key field instead).

### 9.2 Lookup and rollup fields over relations

```ts
{ type: "lookup", relationFieldId, targetFieldId, pick: "first" | "all" }
{ type: "rollup", relationFieldId, targetFieldId, fn: DatabaseAggregateFn }
```

Computed at read time through the same overlay pipeline as formulas (merged
into row values → filters/sorts/groups/Calculate all work); the expression
engine's row scope exposes them (`thisPage.Price` where Price is a lookup), so
`thisPage.Shares * thisPage.Price` is the portfolio market-value formula with
zero new engine work. Formula-references-formula stays deferred; lookups are
leaves.

### 9.3 Parameterized databases — context binding at open

The generalization the row-page templates were built for: **a database block's
view can be bound to the hosting row's properties, evaluated at open**.

- **Row scope context**: row pages (virtual and materialized — identified by
  `databaseRowSource`) provide an ambient `{ fields, values }` scope to their
  block tree.
- **Token-valued filter conditions**: a condition value may be an expression
  token string (`{{ thisPage.Symbol }}`). Inside a row scope, view resolution
  substitutes tokens (expression engine, errors → condition skipped) before
  `applyFilter`; outside any scope, token conditions fail-open with an edit-mode
  badge ("Binds to page context").
- The canonical composition: a Projects database whose row template embeds a
  Tasks database block filtered `Project is {{ thisPage.Name }}` — every
  project page opens onto ITS tasks, one template, zero per-row storage. Same
  pattern gives the portfolio: a Market-history block filtered
  `Symbol is {{ thisPage.Symbol }}`.
- `instantiateTemplateBlocks` keeps database-block tokens UNevaluated at
  materialization — binding stays live in materialized pages (tokens live in
  view filter values, resolved at render, so parent-property renames propagate).

### 9.4 Parameterized connectors — virtual child synced databases (later)

Prototype synced databases with token-valued connector config
(`symbol: {{ thisPage.Symbol }}`): opening a row instantiates a virtual synced
database keyed `(prototypeDatabaseId, rowId)` — cache, not storage, same
philosophy as virtual row pages. Deferred behind 9.1–9.3; most portfolio needs
are covered by match-relations + history capture (§8) without it.

### 9.5 Charting across databases

Chart config gains additional series sources (`databaseId, viewId, fieldId,
aggregate` each) overlaid on a shared bucketed x-axis; with history capture
(§8), `x: time` mode charts captured series per row (symbols as series) and an
aggregate-across-series toggle yields portfolio-value-over-time.

### 9.6 Phasing

| Slice | Scope |
|---|---|
| R1 | Relation field (both bindings), pills, row picker, indexes |
| R2 | Lookup/rollup fields through the computed overlay |
| R3 | Row scope context + token filter values (parameterized linked views) |
| R4 | Multi-source chart series; history capture + time-axis charts |
| R5 | Parameterized connector configs (virtual child synced databases) |

## 10. What we deliberately rejected

| Option | Why not |
|---|---|
| Rows as blocks in `localBlocksCollection` | Notion's own slow path; couples row count to canvas/snapshot/transaction machinery |
| EAV / property-bag storage with name keys | Rename rewrites; unindexable; both Grist and Baserow demonstrate the flat-typed alternative |
| Canvas grid (Glide Data Grid) / AG Grid | Design system can't reach canvas cells; React 19 gaps (Glide); $999/dev licensing for the relevant AG tier |
| A sync backend (cron + DB) | The point is client-side; the browser lineup (GitHub/CoinGecko/HN/…) is strong, Web Locks + TanStack Query make coordination tractable, and the proxy covers the stragglers statelessly |
| Public CORS proxies | SSRF/MITM graveyard (cors-anywhere CVE-2020-36851); same-origin allowlisted proxy only |
| IndexedDB persister for big tables | Official TanStack DB direction is SQLite-WASM/OPFS; Notion's production experience validates it; community IndexedDB persisters exist as fallback only |
