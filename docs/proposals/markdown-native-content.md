# Proposal: markdown-native content format

Status: **implemented** (phases 1–5; see [markdown-content-format](../architecture/markdown-content-format.md) for the shipped behavior — this document is the original design rationale). This doc maps every block
type onto markdown, proposes a file layout (index files + frontmatter), designs a
markdown analog for databases, and sketches a migration path. The end state: the
`content/` tree is a plain markdown workspace, the block editor is *functionally a
markdown editor*, and external tools (Obsidian, iA Writer, git diffs, LLMs) can
read and write site content directly.

## Why this is closer than it looks

Three properties of the current architecture make this feasible without touching
the runtime editor:

1. **The block model is already markdown-shaped.** Of the 21 block types
   ([`block.ts`](../../src/lib/schemas/block.ts)), roughly 14 map 1:1 onto
   CommonMark/GFM constructs. The document is a flat ordered array with
   `parentId` links — exactly what an mdast tree flattens to.
2. **A lossy converter pair already exists.**
   the old `page-to-markdown` and
   `markdown-to-blocks` converters (since replaced by the canonical codec) handled
   headings, lists, checklists, quotes, code, GFM tables, media, dividers, and
   page links today. What they drop: inline `marks`, layout containers
   (columns/tabs are flattened), callout icons, block colors, and all database
   content. This proposal is a **fidelity upgrade of an existing seam**, not a
   new subsystem.
3. **The shipped format is already a build-time artifact.** Pages shipped as
   block JSON under `content/pages/` bundled via `import.meta.glob`
   ([`page-store.server.ts`](../../src/lib/content/page-store.server.ts)) and are
   written back by the dev **Save all** flow
   ([`save-page.ts`](../../src/lib/content/save-page.ts)). Swapping the on-disk
   encoding only touches the load/save boundary. The local-first runtime
   (localStorage collections, `blockOrder`, snapshots, undo) keeps its block
   model unchanged — markdown becomes the *interchange and source-of-truth
   format*, not the in-memory one.

## Design principles

- **Canonical normal form.** Every page has exactly one serialization.
  `parse(serialize(blocks))` must equal `blocks` (after
  `normalizeEditablePageBlocks`), and `serialize(parse(md))` must equal `md` for
  canonical input. Property-test this; it is the whole ballgame.
- **Plainest syntax wins.** A block serializes to bare CommonMark/GFM whenever
  its props are all defaults. Extension syntax (attributes, directives) appears
  only when a non-default prop needs encoding. A paragraph is a paragraph.
- **Degrade gracefully.** Non-standard constructs should still render acceptably
  on GitHub/Obsidian: callouts as blockquotes, toggles as headings, tabs/columns
  as sectioned content.
- **Filesystem is the tree.** Directory structure carries `slug` and `parentId`;
  frontmatter carries only what the path cannot.

## File layout

```
content/
├── pages/
│   ├── index.md                    # home (slug /)
│   ├── previous-work/
│   │   ├── index.md                # /previous-work (today: previous-work.json)
│   │   └── altitude.md             # /previous-work/altitude
│   └── ...
└── databases/
    └── reading-list/
        ├── index.md                # definition: fields, views, row template
        └── rows/
            └── snow-crash.md       # one row = one file
```

- A page with children becomes a folder with `index.md`; a leaf page is a bare
  `.md` file. `slugToRelativePath` / `relativePathToSlug`
  ([`page-path.ts`](../../src/lib/content/page-path.ts)) already encode this
  mapping for JSON — the folder/index form replaces the current
  `previous-work.json` + `previous-work/` sibling split.
- `parentId` is **derived** from the path at load time (the containing folder's
  `index.md`). It disappears from the shipped format entirely; the runtime
  collections keep using UUIDs.

### Page frontmatter

```markdown
---
id: 218fbd52-ab6f-4505-8491-c079753946f7
title: Altitude
icon: tabler:IconBuildingSkyscraper
order: 2                      # sidebarOrder — omit for title sort
font: serif                   # page settings, only when non-default
fullWidth: true
cover:
  src: https://images.unsplash.com/...
  focalY: 40
  credit: { name: ..., username: ..., link: ... }
---
```

- `id` stays: `pageLink` props, `parentId` in local collections, favorites, and
  the baseline-hash bookkeeping all key on the UUID. Everything else in
  [`pageSchema`](../../src/lib/schemas/page.ts) either moves to the path (`slug`,
  `parentId`) or is optional-when-default (`pageSettingsSchema` fields).
- `title` lives in frontmatter, **not** a leading `#` heading — body blocks may
  legitimately contain their own H1s, and Notion-style title-vs-content
  separation is worth keeping unambiguous. (The current lossy exporter emits
  `# title`; the canonical format should not.)

## Block mapping

### Tier 1 — pure CommonMark/GFM (no extension syntax needed)

| Block | Markdown | Notes |
|-------|----------|-------|
| `text` | paragraph | |
| `heading` (1–4) | `#`–`####` | |
| `list` bullet/ordered + `text` children | `- item` / `1. item` | child `indent` (0–4) → nesting depth |
| `checklist` + `checklistItem` | `- [ ]` / `- [x]` | |
| `quote` | `> text` | |
| `code` | fenced block with language id | `props.language` is already a Shiki id ≈ fence info string |
| `divider` | `---` | |
| `table`/`tableRow`/`tableCell` | GFM pipe table | header row = `hasHeaderRow`; cell `marks` are inline syntax (GFM allows it) |
| `media` (image, `source: url`) | `![alt](https://…/photo.jpg)` | |
| `embed` (bare) | autolink paragraph `<https://…>` | a paragraph that is exactly one autolink = embed block |
| `pageLink` | paragraph that is exactly one link whose href is the target's relative file path (`./previous-work/altitude.md`) | parse resolves path → `pageId` via the catalog. `variant` is dropped — the renderer already derives child-vs-linked relationally ([pages — Page links](../architecture/pages.md#page-links)) |

Two ambiguity rules make the last three deterministic: a paragraph consisting of
*only* an internal `.md` link is a `pageLink`; *only* an autolink is an `embed`;
anything else is `text`.

### Inline marks ↔ inline syntax

`marks` are offset ranges over `props.text`
([`rich-text.ts`](../../src/lib/schemas/rich-text.ts)) — the canonical string
stays plain. Serialization is the classic rich-text→markdown range flattening:
split overlapping ranges at boundaries, emit properly nested delimiters, escape
literal syntax characters in the text. Parsing inverts it.

| Mark | Syntax |
|------|--------|
| bold | `**…**` |
| italic | `*…*` |
| strikethrough | `~~…~~` (GFM) |
| code | `` `…` `` |
| link | `[text](https://…)` |
| underline | `<u>…</u>` — no markdown form; inline HTML renders everywhere and round-trips |

This is the single biggest fidelity gap in the current converters (marks are
dropped both directions) and the highest-value first step regardless of whether
the rest of this proposal ships — it immediately makes **Export page** and
markdown paste lossless for prose.

### Tier 2 — attributes on standard constructs

For props with no syntax home on an otherwise-standard block, use a trailing
pandoc-style attribute braces suffix, emitted **only when non-default**:

| Case | Example |
|------|---------|
| block `color` / `backgroundColor` | `Some text {color=red bg=yellow}` |
| non-list `indent` | `Indented note {indent=2}` |
| `media` width / video / asset | attribute suffix on the image: `{video width=60}` (video-vs-image is otherwise inferred from the extension) |
| `embed` caption/unfurl overrides | `<https://example.com>{caption="Demo video"}` |
| table extras | `{widths="120,240,120" header-column}` on the line after the table, only when customized |
| `toggleHeading` | `## Roadmap {toggle collapsed}` |

**Toggle headings deserve a highlight**: markdown's implicit heading scope *is*
the toggle's child scope. Serialize the toggle as a plain heading with `{toggle}`
and its children as the following siblings; on parse, absorb following content up
to the next heading of equal-or-higher level — exactly the existing
`absorb: true` conversion semantic
([`toggle-heading-layout.ts`](../../src/lib/canvas/toggle-heading-layout.ts)).
Renders as a normal section everywhere else.

### Tier 3 — container directives

Callouts, columns, and tabs have no markdown analog. Two candidate encodings:

1. **Generic directives** (`remark-directive` syntax): fenced `:::name{attrs}`
   containers that nest via colon count. Established convention (Docusaurus,
   many SSGs), attribute-capable, and directive *content is plain markdown*, so
   nesting arbitrary blocks inside columns/tabs falls out for free.
2. **Inline HTML** (`<details>`, `<div class="columns">`): renders on GitHub but
   is miserable to hand-author and turns the file into HTML soup.

Recommend directives:

```markdown
> [!💡] Callout body is regular blockquote content.        ← callout: Obsidian-style

::::columns
:::column{width=2}
Left content — any blocks.
:::
:::column
Right content.
:::
::::

::::tabs{default=2}
:::tab{label="Overview" icon=🔍}
…
:::
:::tab{label="Details"}
…
:::
::::

::database{id=reading-list view=board hide-title}
```

- **Callout** gets the blockquote-based Obsidian form rather than a directive —
  it degrades to a plain blockquote on GitHub, and the `[!…]` token carries the
  icon string (emoji or `tabler:IconName`). Body lines are the child blocks.
- **`tabs.defaultTabId`** becomes a 1-based index attribute — tab identity within
  a document is positional, so no ids needed.
- **`database`** is a leaf directive holding the reference
  (`{databaseId, viewId?, hideTitle?}`); `view` refers to the saved view by name.

### Block ids

Markdown has no per-block ids, and sprinkling `{#uuid}` on every line would
defeat the purpose. Proposal: **drop block ids from the shipped format** and mint
them deterministically at parse time (`hash(pageId + tree-path + occurrence)`).

This works because shipped-content bookkeeping never needs cross-build id
stability: the seeder replaces pristine pages wholesale, staleness compares
content hashes ([`block-hash.ts`](../../src/lib/content/block-hash.ts)), and the
three-way merge ([`merge-page-blocks.ts`](../../src/lib/pages/merge-page-blocks.ts))
matches on content. Deterministic minting additionally keeps ids stable across
re-parses of unchanged files, which keeps merge quality where it is today.
In-document references that used ids (`defaultTabId`) become positional.

## Databases: folder-of-markdown analog

The genuinely non-markdown entity. The natural analog — used by Obsidian Bases
and Notion's own export — is **a database is a folder; a row is a markdown file;
field values are frontmatter properties**:

```markdown
# content/databases/reading-list/index.md
---
id: db_9f2c
name: Reading List
icon: 📚
primary: Title
fields:
  - { name: Title, type: text }
  - { name: Status, type: select, options: [{ name: Reading, color: blue }, …] }
  - { name: Rating, type: number, format: integer }
  - { name: Finished, type: date }
views:
  - { name: All, type: table, sorts: [{ field: Finished, dir: desc }] }
  - { name: Board, type: board, groupBy: Status, filter: { … } }
---
Optional body = the row-page template, with {{ thisPage.X }} tokens.
```

```markdown
# content/databases/reading-list/rows/snow-crash.md
---
Title: Snow Crash
Status: Finished
Rating: 5
Finished: 2026-05-14
---
Body = the materialized row page, when one exists. Absent body = virtual row.
```

Mapping notes against [`database.ts`](../../src/lib/schemas/database.ts):

- **Field names replace field ids as row keys.** Human-readable frontmatter is
  the point; the cost is that a field rename rewrites every row file. That's a
  dev-time save-all operation producing an honest git diff — acceptable. (The
  conservative alternative — keep ids as keys — preserves rename-stability but
  makes rows unreadable and defeats external editing.)
- **Views, filters, chart/board config** are deeply nested but plain data — YAML
  frontmatter on `index.md` holds them without loss. Nobody hand-authors a chart
  config either way; the win is that rows and schema are hand-authorable.
- **Row `order`** → array of row file names in `index.md` frontmatter, present
  only when manual order exists (sorts usually win anyway).
- **Connector databases** ship `index.md` only (`source:` config in
  frontmatter, `sourceKey` marks on fields) — no row files, exactly like today's
  JSON documents, since the sync engine repopulates rows client-side.
- **Formula fields** ship the `expression` string in the field definition;
  values are computed at read time and never stored — nothing to serialize.
- **Row pages** get markedly more coherent: the copy-on-write materialized page
  ([databases — Row pages](../architecture/databases.md#row-pages-virtual--copy-on-write))
  *is the file body*, next to its own properties. This is the Notion mental
  model rendered literally on disk.

This piece is independent and higher-effort — see phasing. An honest interim
state keeps the JSON documents in `content/databases/` while pages go markdown.

## What changes in code

| Seam | Today | After |
|------|-------|-------|
| Parser/serializer | hand-written line scanner, lossy (since deleted) | unified/remark pipeline (`remark-parse` + `remark-gfm` + `remark-frontmatter` + `remark-directive`) with a bidirectional `mdast ↔ Block[]` mapping layer. Correct escaping and a canonical printer are exactly what the ecosystem solves; hand-rolling them is where round-trip bugs breed. Server/build + dev-save use it directly; the client paste-importer lazy-loads the same module |
| Load | `import.meta.glob("content/pages/**/*.json")` | same glob over `**/*.md` (`?raw`), parse to `pageSchema` at build; `parentId`/`slug` derived from path |
| Save all | `JSON.stringify` per page ([`save-page.ts`](../../src/lib/content/save-page.ts)) | serialize blocks → canonical markdown; write folder/index layout |
| Baseline hash | hash of block JSON | unchanged — keep hashing **parsed blocks**, so the baseline is encoding-independent and the JSON→md migration doesn't mark every page stale |
| Media assets | IndexedDB-only (`source: "asset"` can't actually ship) | save-all writes asset blobs to `public/media/<hash>.<ext>` and rewrites to URL sources — fixes a real gap in shipped content today |
| Runtime editor | — | **no changes.** Collections, `blockOrder`, reducer, snapshots, undo all keep the block model |

## Known losses and edge cases (the honest ledger)

- **Consecutive blank rows collapse.** Markdown can't represent two adjacent
  empty paragraphs. Normal form: blank `text` rows serialize to nothing;
  `normalizeEditablePageBlocks` re-adds the trailing editor blank on load.
  Authors using stacked blanks as spacing lose them (arguably a feature). If it
  matters, `<br>` lines are the escape hatch.
- **Escaping is the risk concentration.** User prose containing markdown syntax
  must escape on serialize and unescape on parse, byte-exactly. Mitigation:
  golden fixtures per block type + a property test generating random block
  trees and asserting both round-trip directions.
- **`tableRow.height` and px `columnWidths`** are presentational noise in a
  content format; attributes-when-customized keeps them, but defaulting more
  aggressively is worth considering.
- **Directive syntax isn't rendered by GitHub** — columns/tabs content shows as
  plain sequential sections there. Acceptable degradation.
- **Parse determinism is a contract.** The ambiguity rules (link-only paragraph
  = pageLink, autolink-only = embed, heading-absorb for toggles) must be
  specified and tested, not emergent.

## What it unlocks

- **Readable git history** for content — today's block-JSON diffs are opaque.
- **External editing**: fix a typo in the GitHub web editor or Obsidian, deploy,
  and the existing baseline-replace seeding delivers it to visitors. The repo
  becomes a legitimate authoring surface, not just a persistence target.
- **A raw-markdown mode** in the editor becomes a serializer round-trip away —
  the "make this all a markdown editor in functionality" goal reduces to a view
  toggle once the format is canonical.
- **Lossless copy/paste and export** (the current `.md` export stops being
  lossy).
- **LLM-friendliness**: agents can read and write site content without learning
  the block schema.

## Phasing

1. **Marks fidelity** (independent win): inline `marks` ↔ inline syntax in the
   existing converters + escaping + round-trip property tests. Ships value even
   if nothing else does.
2. **Full-fidelity converter**: adopt remark/mdast; add attributes, directives,
   callout/toggle/columns/tabs/database-ref encodings; define the normal form;
   golden fixtures for all 21 block types.
3. **Format switch for pages**: loader + save-all read/write `.md` with the
   index-file layout and frontmatter; one-shot `scripts/` migration converting
   existing JSON (3 pages today — the window for this migration could not be
   more open); delete the JSON path after a release of dual-read.
4. **Databases as folders**: rows-as-files format, schema/views in `index.md`
   frontmatter, row-template body. Independent of 1–3; JSON remains a fine
   interim.
5. **Editor payoffs**: raw markdown editing mode, markdown-first clipboard,
   documented external-editing workflow.

## Related

- [Block model](../architecture/block-model.md)
- [Block types](../architecture/block-types.md)
- [Databases](../architecture/databases.md)
- [Local-first persistence](../architecture/local-first-persistence.md)
- [Author dev mode](../architecture/author-dev-mode.md)
