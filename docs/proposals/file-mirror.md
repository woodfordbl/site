# File mirror — markdown + CSV as a first-class replica

Status: proposal (August 2026). Companion to
[realtime-sync-engine.md](./realtime-sync-engine.md). Covers (1) data-structure
optimizations worth making now, and (2) a bidirectional file representation of a
workspace — pages as markdown with frontmatter, databases as CSV/markdown — kept in
real-time sync with the internal block/row store, so AI agents (and humans with a text
editor) can edit the file tree or talk to an MCP server instead of manipulating blocks.

## 1. Why a file mirror, and what it is not

The internal model — flat id-keyed blocks, typed database rows, granular transactions —
is the right *store*. It is a poor *agent surface*: an agent editing a page should not
need to know about `parentId` forests, `U+FFFC` sentinels, or fractional indexes. Files
are the universal agent interface: Claude Code, Cursor, and every shell tool already
speak markdown and CSV fluently.

The design principle that makes this tractable: **the file tree is a replica, not the
source of truth.** Blocks and rows stay canonical. The mirror engine is *just another
sync client* — it subscribes to collections the same way a browser tab does, serializes
to files, watches for external edits, and writes back through the same transaction ops
every other client uses. That framing buys us:

- Real-time bidirectionality falls out of machinery we already have (or are building in
  the sync-engine proposal) rather than a bespoke import/export pipeline.
- The mirror composes with every deployment mode: local-only (Electron/desktop, agents
  editing `~/workspace/`), synced (mirror writes flow through Electric to all devices),
  or headless (an MCP server exposing the same codec with no filesystem at all).
- Conflict handling reuses the existing three-way merge — the file tree is simply a
  third replica alongside "local" and "remote."

Notably, the codebase already points this way: `rich-text.ts` says of formula
expressions *"once markdown becomes canonical the definition moves to page
frontmatter"*, and [inline-prose-tokens.md](./inline-prose-tokens.md) reserves
`lib/markdown-canonical/frontmatter.ts`. This proposal is the destination those notes
anticipate.

## 2. Data-structure optimizations (do these first)

Ordered by leverage. The first three serve sync *and* the mirror; the rest are
mirror-specific enablers or cheap wins.

### 2.1 Per-block fractional ordering (from the sync proposal — required here too)

The page-level `blockOrder` array is the one structure a file mirror cannot merge
against: any file edit that inserts a paragraph rewrites the whole array. With ordering
as a per-block `fractionalIndex`, a file-side insertion becomes one new block row and
zero touched neighbors. Same change, second consumer. (Use a lexicographic
implementation like `fractional-indexing`; the midpoint math in
`database-collection-ops.ts` is the in-house precedent.)

### 2.2 Normalize `database.fields[]` and `views[]` out of the definition row

Today both live embedded in `localDatabaseSchema`, so any two edits to a database's
structure collide on one document — and the mirror has nowhere natural to put field
definitions (they'd have to ride the CSV, which agents would mangle). Split into:

- `database_fields` — one row per field (`id, databaseId, name, type, config, order`).
  Stable field ids already exist and never rewrite rows; this just gives them their own
  rows. Maps 1:1 to the mirror's `schema.yaml` entries.
- `database_views` — one row per view. Also opens the door to separating *shared* view
  definitions from *per-user* view state (active sort/filter tweaks) later.

`database-document.ts` already derives shipped formats via `.omit()`; the same derivation
keeps the shipped JSON format stable while the store normalizes.

### 2.3 UUIDv7 for new ids

`createId()` helpers currently wrap `crypto.randomUUID()` (v4). Switch new id minting to
**UUIDv7**: time-ordered prefixes give Postgres B-tree locality (inserts append rather
than splatter), ids sort by creation time for free, and existing v4 ids stay valid
alongside. One-line change in ~5 helpers; do it before the first Postgres migration so
most rows benefit.

### 2.4 Collapse simple tables to a matrix block (optional, high row-count leverage)

`table`/`tableRow`/`tableCell` are three block types where one would do: a 10×10 table is
**111 block rows** today. Since cells hold plain text (`tableCellPropsSchema`), a single
`table` block with `props.cells: string[][]` (plus per-cell marks keyed by coordinate if
needed) cuts row count ~100×, makes the GFM pipe-table mapping bijective, and coarsens
conflicts to the table level — acceptable for the "simple table" use case these blocks
serve (databases cover the structured case). This is an editor-touching change; schedule
it independently, but before syncing workspaces with heavy table use.

### 2.5 Slim the local bookkeeping as sync lands

Once server truth exists for signed-in users, `serverBaselineHash`,
`serverMetadataBaseline`, and the dirty-cookie machinery stay only in anonymous blog
mode (per the sync proposal). The mirror needs none of them — its base state lives in
its own snapshot store (§4.4).

### 2.6 What *not* to change

- **Plain text + offset marks stays.** The seven mark types (`bold`, `italic`,
  `underline`, `strikethrough`, `code`, `link`, `formula`) are exactly markdown's inline
  vocabulary (underline via `<u>…</u>`, page links via wikilink/relative href, formula
  via `{{ … }}` — see §3.3). The representation is already normalized-on-write and
  sentinel-stable. A token/segment model would ease merging but buys little while
  block-level LWW is the concurrency model.
- **Sparse `values: Record<fieldId, CellValue>`** on rows — already the right shape for
  CSV projection.
- **Content-hash asset store** — SHA-256 keys become filenames directly (§4.1).

## 3. The canonical codec

`lib/markdown/` already contains a lossy exporter (`page-to-markdown.ts`) and a
title/icon-aware importer (`markdown-to-blocks.ts`) with tests. The mirror needs these
promoted from "portability export" to a **canonical, round-trip codec** — new module
`lib/markdown-canonical/` (the path inline-prose-tokens already reserves), leaving the
lossy clipboard/export paths alone until they can be folded in.

### 3.1 Page files

```markdown
---
id: 018f3c1e-…            # page id — the one id that lives in files
icon: 🚀
font: serif               # pageSettings, only non-defaults
fullWidth: true
---

# Roadmap

First paragraph with **bold**, a [[projects/index|Projects]] link, and an
inline formula {{ count(db("Tasks")) }}.

> [!callout] 💡
> Callouts use the Obsidian-compatible admonition form.

:::columns
::column
Left column content.
::column
Right column content.
:::
```

- **Frontmatter carries identity and page-level state**: `id`, `icon`, non-default
  settings. Title stays the leading `# H1` (as the current codec already does). Agents
  reliably leave frontmatter intact; it is the one place ids are welcome.
- **Hierarchy is the directory tree**: `pages/projects/index.md` is the "Projects" page,
  `pages/projects/roadmap.md` its child. Moving a file re-parents the page; the
  frontmatter `id` makes rename/move detection exact rather than heuristic.
- **Block-level constructs** extend the current codec: toggle headings as
  `> [!toggle] # Heading` or a `{data-toggle}` heading attribute; callouts as Obsidian
  admonitions (`> [!callout]`); columns/tabs as `:::` directive containers (today's
  exporter flattens them — the canonical codec must not); `database` blocks as
  `![[databases/tasks]]` embeds; dividers, code fences, lists, checklists, GFM tables as
  today.
- **Inline marks** serialize to standard syntax: `**bold**`, `*italic*`, `<u>u</u>`,
  `~~strike~~`, `` `code` ``, `[text](href)`, `[[page-path|text]]` for `pageId` links
  (paths resolved through the mirror's id↔path table), `{{ expression }}` for formula
  marks (exactly the inline-prose-tokens serialization; the sentinel character never
  appears in files).
- **Colors and exotic props** — the deliberate residue. Block `color`/`backgroundColor`
  and anything else markdown can't say are *not* serialized. They survive through the
  preservation rule (§4.3), not through syntax. This keeps files clean for agents, which
  is the entire point.

### 3.2 Database files

```
databases/
  tasks/
    schema.yaml          # canonical field + view definitions
    rows.csv             # data-only rows
    rows/
      fix-login-flow.md  # rows that have page content
```

- **`schema.yaml`**: database id/name/icon, `primaryFieldId`, fields
  (`id, name, type, config` — select options, number format, relation target, formula
  source), views. YAML because agents read *and cautiously edit* it (add a select
  option, add a field); the mirror validates against `databaseFieldSchema` on import and
  rejects/reports invalid edits rather than guessing.
- **`rows.csv`**: header row = field *names*; `schema.yaml` maps names↔ids so a column
  rename is a schema edit, not an orphaned column. First column `_id` holds the row id;
  agents appending rows may omit it and the mirror assigns a UUIDv7 on import. Formula
  fields are **excluded** (computed at read time — exporting them would invite agents to
  edit derived values); relation cells serialize as target row ids (or `_id`-less
  human keys if we later add unique display keys).
- **Rows with page content** ("filled sheets") move from the CSV to
  `rows/<slug>.md`: frontmatter = `id` + field values (typed YAML — numbers, booleans,
  ISO dates, string arrays for multi-select), body = the row's page blocks via the page
  codec. A row gains a file when it gains content; the mirror keeps membership between
  `rows.csv` and `rows/` mutually exclusive so nothing is stated twice. This is
  deliberately the Astro/Obsidian "content collection" shape — the format agents have
  seen a million times.

### 3.3 Round-trip contract

The codec must satisfy, and be property-tested on: **parse(serialize(store)) ≡ store**
modulo the declared residue (colors, column widths, per-block ids). The reverse
direction is *not* required to be bijective — arbitrary hand-written markdown maps into
the model via the importer's existing normalization rules. The residue list is an
explicit, documented constant, because §4.3 depends on knowing exactly what serialization
loses.

## 4. The mirror engine

A small runtime that runs wherever a filesystem exists: the Electron main process, a
standalone daemon (`site mirror ~/my-workspace`), or a dev-mode Vite plugin. Anatomy:

### 4.1 Layout on disk

```
my-workspace/
  pages/**.md
  databases/<db-slug>/{schema.yaml, rows.csv, rows/*.md}
  assets/<sha256>.<ext>       # content-addressed, straight from the asset store
  .mirror/                    # engine state — base snapshots, id↔path map, file hashes
```

`.mirror/` is the engine's private state; the rest is the human/agent surface. The whole
tree is **git-friendly by construction** — plain text, stable ordering, content-hashed
assets — so version control of a workspace comes free (and `git diff` becomes a
workspace changelog).

### 4.2 Sync loop

Two directions, one merge:

- **Store → files**: subscribe to the collections (local collections in Electron;
  Electric-backed when signed in — the mirror is indistinguishable from a browser tab).
  On commit, re-serialize affected files. Record each written file's content hash in
  `.mirror/` **before** writing.
- **Files → store**: watch with chokidar, debounced per file (agents save in bursts). A
  change event whose content hash matches the last-written hash is our own echo — drop
  it. Otherwise parse and merge.
- **Echo suppression via hashes, not timing** — the classic two-way-sync failure mode
  (infinite loops, missed edits during writes) is avoided by comparing content, never
  timestamps.

### 4.3 Merge: reuse what exists

For an externally edited page file, run a **three-way, block-granular merge**:

- *base* = the `.mirror/` snapshot of the page's blocks at last sync,
- *ours* = current store state,
- *theirs* = the parsed file.

This is exactly the shape of `merge-page-blocks.ts` (base/local/remote per block id, no
text diffing, unchanged side yields) — with one new ingredient: **parsed files carry no
block ids**, so before merging, match *theirs* against *base* to recover identity:

1. Exact-content matches (serialized form identical) keep their base block id — and,
   crucially, keep the base block object wholesale, so colors, column layout, and every
   residue prop survive an agent's edit to *other* blocks. This is the **preservation
   rule**: you only lose what you touch.
2. Remaining blocks match by similarity in order (same type + high text overlap, an LCS
   pass over the block sequences) — an edited paragraph keeps its id.
3. Unmatched file blocks are inserts (fresh UUIDv7s); unmatched base blocks are deletes.

Then the existing merge semantics apply, and the result commits through
`applyPageBlockDiff` — the id-keyed diff→insert/update/delete op that already exists in
`block-collection-ops.ts` for precisely this "reconcile a computed block set" job. CSV
merges are simpler: rows are id-keyed by `_id` (or content-matched for id-less
appends), cells merge field-wise LWW against base.

Conflicts (both sides changed the same block/cell) resolve store-wins, and the mirror
writes the file back to the merged state immediately — the file system always converges
to the store's truth within one cycle, and a conflict report lands in the engine log
(surfaced as a toast in-app).

### 4.4 Full-project load and export

The same codec, run in bulk, gives the two one-shot commands for free:

- `site import <dir>` — hydrate an empty workspace from a file tree (this is "load a
  full project from markdown": parse everything, mint ids where absent, write
  `.mirror/` base state, done).
- `site export <dir>` — materialize a workspace to files (also the new backup format,
  superseding ad-hoc zip archives, and a workspace-migration vehicle).

## 5. The agent story

Two complementary surfaces, one codec:

- **Filesystem agents** (Claude Code, Cursor, shell scripts): edit
  `pages/roadmap.md`, append rows to `rows.csv`, add a field in `schema.yaml`. The
  mirror engine picks changes up within a debounce window, merges, and — when the sync
  engine from the companion proposal is live — Electric propagates to every device in
  real time. The agent needs zero knowledge of blocks, ids, or the app.
- **MCP server**: the mirror engine minus the filesystem. Expose the codec as tools —
  `list_pages`, `read_page(path) → markdown`, `write_page(path, markdown)` (runs the
  same identity-matching merge), `query_database(db, filter)`, `upsert_rows(db, rows)`,
  `update_schema(db, patch)`. Structured operations (querying, bulk row edits) are
  clumsy through CSV; MCP covers them, and works against a *remote* workspace where no
  file tree exists. Because both surfaces share the codec and merge path, an agent can
  mix them freely.

Guardrails worth building in from day one: the mirror validates every import against the
zod schemas and quarantines unparseable files (the `site-local-blocks-quarantine`
pattern, applied to files — a `.mirror/rejected/` copy plus a log line) rather than
half-applying; schema edits that would orphan data (deleting a field with values)
require an explicit `--force` / MCP confirmation flag.

## 6. Phasing

1. **Canonicalize the codec** — `lib/markdown-canonical/`: frontmatter, directive
   containers, inline-mark serialization, the residue constant, property tests
   (`parse(serialize(x)) ≡ x` over generated pages). Pure functions; highest
   test-leverage work in the whole proposal. (Unblocks and is shared with
   inline-prose-tokens.)
2. **Schema normalization** — §2.2 fields/views split, UUIDv7 minting (§2.3),
   coordinated with the sync proposal's Postgres migration so both land once.
3. **One-shot import/export CLI** — `site export` / `site import` against local
   collections. Immediately useful (backups, git-versioned workspaces) before any
   watching exists.
4. **Watch mode** — chokidar loop, hash-based echo suppression, identity-matching
   three-way merge through `applyPageBlockDiff`, conflict reporting.
5. **MCP server** — wrap the codec + merge in tools; runs locally against the same
   engine, or remotely against the sync API.
6. **Electron shell** — package app + mirror engine; the desktop app's pitch becomes
   "your workspace is a folder."

Dependencies: phases 1–3 need nothing from the sync proposal and work against today's
localStorage collections. Phase 4+ get *multi-device* reach only once Electric sync
exists, but degrade gracefully to local-only.

## 7. Risks and open questions

- **Identity matching is heuristic** at step 4.3(2). Mitigations: the preservation rule
  makes false *misses* cheap (a re-minted id loses only future anchors, not content);
  false *matches* are bounded by the same-type + similarity threshold. Watch real agent
  transcripts and tune.
- **Directive syntax** (`:::columns`, `> [!toggle]`) is convention, not standard;
  agents may occasionally break it. The importer must treat malformed directives as
  plain text (never data loss), and the next serialize pass re-normalizes.
- **Large CSVs**: rewriting `rows.csv` on every row edit is O(table). Fine to thousands
  of rows; beyond that, shard by view or switch that database to rows/*.md. Defer.
- **Concurrent agent + user edits to the same block** land on block-level LWW, same as
  the sync proposal's live-editing semantics — acceptable, documented, and the mirror's
  store-wins convergence keeps files honest.
- **Should the blog's `content/pages/*.json` become markdown?** Out of scope here, but
  phase 1's codec makes it a mechanical migration whenever desired — and then the blog,
  too, is agent-editable files.
