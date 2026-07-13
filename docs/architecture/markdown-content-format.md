# Markdown content format capability

`content/` is a plain markdown workspace: pages are `.md` files with YAML
frontmatter, databases are folders of `index.md` + `rows.csv`, and a canonical
bidirectional codec converts between files and the runtime block model. In
local dev, disk is the source of truth and the editor is functionally a
markdown editor over the repo ([dev disk mode](#dev-disk-mode)). Production
visitors keep the localStorage local-first model unchanged
([local-first-persistence](./local-first-persistence.md)).

## The codec — `src/lib/markdown-canonical/`

Lossless, deterministic `Block[] ↔ markdown` on unified/remark (`remark-parse`,
a GFM subset — strikethrough/table/task-list, no autolink literals —
`remark-frontmatter`, `remark-directive`). Server code imports
[`parse-page.ts`](../../src/lib/markdown-canonical/parse-page.ts) /
[`serialize-page.ts`](../../src/lib/markdown-canonical/serialize-page.ts)
directly; browser flows lazy-load one chunk via
[`loader.ts`](../../src/lib/markdown-canonical/loader.ts) (the Shiki pattern).

| Concern | Mechanism |
|---------|-----------|
| Inline marks | [`inline-marks.ts`](../../src/lib/markdown-canonical/inline-marks.ts) — `segmentRichText` segments → greedy longest-run-outermost wrappers; underline = paired `<u>` html; code is always innermost (a leaf) |
| Mark normal form | Verify-and-degrade: candidate phrasing is stringified + reparsed in isolation; marks that can't survive CommonMark attention (whitespace flanking, surrogate-half classification, delimiter adjacency, GFM `~~` strictness) are dropped rather than corrupting text |
| Extension props | [`attributes.ts`](../../src/lib/markdown-canonical/attributes.ts) — trailing `{key=value flag}` groups, emitted only when non-default; an empty `{}` sentinel protects prose that ends in a group lookalike |
| Deterministic ids | [`block-ids.ts`](../../src/lib/markdown-canonical/block-ids.ts) — minted from `(pageId, tree path)`; files carry no ids, re-parses of unchanged files yield identical ids |
| Frontmatter | [`frontmatter.ts`](../../src/lib/markdown-canonical/frontmatter.ts) — fixed key order, defaults omitted; `pageToFrontmatter` projects page docs |
| Paste heuristic | [`detect.ts`](../../src/lib/markdown-canonical/detect.ts) — dependency-free gate before the lazy chunk loads |

### Block mapping

| Block | Markdown |
|-------|----------|
| `text` | paragraph (blank rows drop from the canonical form; the editor re-adds the trailing blank) |
| `heading` 1–4 | `#`–`####` |
| `toggleHeading` | heading + `{toggle}` (`collapsed` flag); children are the following siblings, re-absorbed on parse up to the next heading of equal-or-higher level |
| `quote` | blockquote |
| `callout` | blockquote whose first paragraph is `[!icon]` (+ attr group); remaining content = children |
| `code` | fenced block with language id |
| `divider` | `---` |
| `list`/`checklist` + children | `-`/`1.` lists and `- [x]` task lists; child `indent` ↔ nesting |
| `table` family | GFM pipe table; extras (`widths`, `header-column`, `no-header-row`, `row-heights`) in a standalone `{…}` trailer paragraph, only when non-default |
| `media` | image syntax (`asset:` prefix for asset sources) + attrs (`video`, `width`, `mime`, `file`) |
| `embed` | paragraph that is exactly one autolink + attrs (`title`, `description`, `image`, `caption`, `show-caption`/`hide-caption`) |
| `pageLink` | paragraph that is exactly one link to a relative `.md` path (`page:<id>` URI when unresolvable); `variant` is derived relationally at render and never ships |
| `columns`/`column` | `::::columns` / `:::column{width=…}` container directives |
| `tabs`/`tab` | `::::tabs{default=<1-based> size variant}` / `:::tab{label icon}` |
| `database` | `::database{id view hide-title}` leaf directive |
| any block | `color`/`bg`/`indent` in its attr group |

**Ambiguity contract** (tested in
[`markdown-canonical.test.ts`](../../src/lib/markdown-canonical/markdown-canonical.test.ts)):
link-only paragraph = pageLink, autolink-only = embed, image-only = media,
`[!…]` blockquote = callout, `{toggle}` heading absorbs its section. Inline
`:name` text directives reconstruct as literal prose (the serializer never
emits them). Foreign constructs degrade to text; unknown container directives
flatten.

**Canonical normal form**: `serialize(parse(serialize(x))) === serialize(x)`
byte-exact — fixed frontmatter key order, defaults omitted, blank rows
dropped, one trailing newline. Round-trip fidelity is enforced by golden
fixtures for all 21 block types plus fast-check properties (round-trip
equality, serializer idempotence, byte-exact plain-text survival).

## File layout — pages

```
content/pages/
├── index.md                  # home (slug /)
├── previous-work/
│   ├── index.md              # /previous-work (has children → folder form)
│   └── altitude.md           # /previous-work/altitude (leaf form)
```

- `slug` derives from the path ([`page-path.ts`](../../src/lib/content/page-path.ts));
  `parentId` from the containing folder's `index.md`. Frontmatter carries
  `id`, `title`, `icon`, `order` (sidebarOrder), page settings, `cover`
  (headerImage), and a `parent` override for tree nesting the path cannot
  express (child of home with a top-level slug).
- The loader accepts BOTH layout variants for a slug (`a.md` and
  `a/index.md` — index wins with a warning); the writer normalizes on every
  save. Assembly is two-pass in
  [`assemble-markdown-pages.ts`](../../src/lib/content/assemble-markdown-pages.ts):
  frontmatter first (path/slug/id maps), then bodies with relative page-link
  resolution.
- Prod reads the `?raw` glob in
  [`page-store.server.ts`](../../src/lib/content/page-store.server.ts)
  (bundled, serverless-safe); dev disk mode reads the filesystem fresh with an
  mtime-fingerprint memo. [`savePage`](../../src/lib/content/save-page.ts)
  serializes server-side, writes atomically (tmp + rename), removes stale
  files for the same page id after renames, and returns the written bytes'
  `contentHash`.

## File layout — databases

```
content/databases/reading-list/
├── index.md      # definition (fields/views/source) as frontmatter; body = row template
└── rows.csv      # all rows' properties; absent for connector databases
```

[`database-folder.ts`](../../src/lib/content/database-folder.ts) +
[`src/lib/csv/csv.ts`](../../src/lib/csv/csv.ts) (tiny RFC 4180 codec, no
dependency). CSV: header = unique field names (id fallback), `id` column
first, `#order` only when manual order exists; select/multiSelect cells store
option NAMES with raw-id fallback; quoted-empty = present empty string,
bare-empty = absent (sparse values hash-stable). Formula values never ship.
`parse(serialize(doc))` is hash-stable (template block ids re-mint
deterministically), so the seeder's baseline flow
([databases — Shipped content](./databases.md#shipped-content)) is untouched.

Scale tier (scaffold): past `DATABASE_LOCAL_ROWS_LIMIT`
([`src/db/rows-index/rows-index.ts`](../../src/db/rows-index/rows-index.ts))
rows skip localStorage and live in a worker-built IndexedDB index rebuilt from
the shipped CSV — text stays canonical, the index is always derived.

## Dev disk mode

Gated by [`isDevDiskMode`](../../src/lib/content/dev-disk/dev-disk-mode.ts)
(`import.meta.env.DEV`, not tests, `VITE_DEV_DISK !== "0"`; compiled out of
prod). `VITE_DEV_DISK=0 pnpm dev` restores the legacy local-first flow — and
is how the production visitor experience is tested locally.

| Direction | Mechanism |
|-----------|-----------|
| Reads | `page-store.server.ts` / `database-store.server.ts` branch to fresh filesystem reads (mtime-fingerprint memoized) |
| Working copy | [`getBrowserStorage`](../../src/db/collections/browser-storage.ts) returns one shared in-memory Storage, so the content collections AND every sync shard reader agree while nothing content-shaped persists in localStorage; favorites/keybindings keep localStorage |
| Outbound | [`dev-disk-sync.ts`](../../src/lib/content/dev-disk/dev-disk-sync.ts) — `subscribeChanges` on blocks/pages/databases (post-commit, off the keystroke path), per-target debounce 400ms idle / 2s max, flush through [`flushLocalPageToSource`](../../src/lib/content/save-all-pages.ts) / `flushLocalDatabaseToSource`; deletes call [`deletePage`](../../src/lib/content/delete-page.ts) |
| Inbound | [`vite-plugins/content-watch.ts`](../../vite-plugins/content-watch.ts) (chokidar) broadcasts `site:content-changed` over Vite's HMR websocket (per-path debounce; >20-file bursts coalesce to `bulk`); [`apply-external-change.ts`](../../src/lib/content/dev-disk/apply-external-change.ts) invalidates content queries, reconciles open working copies in place (pending local flushes win), and re-runs the database seeder for `content/databases/` edits |
| Echo suppression | [`own-writes.ts`](../../src/lib/content/dev-disk/own-writes.ts) — hash LRU fed by the save fns' returned content hashes |
| HMR decoupling | `server.watch.ignored: ["**/content/**"]` in [`vite.config.ts`](../../vite.config.ts) — flushes never invalidate the module graph; typing causes zero reload churn |
| Gated-off legacy flows | [`PageStaleBanner`](../../src/components/pages/page-stale-banner.tsx) renders null; the SSR dirty-pages cookie no-ops |

Client wiring mounts in
[`DevContentSyncEffect`](../../src/components/pages/dev-content-sync-effect.tsx)
(AppProviders). Serialization always happens server-side — remark never runs
on the typing path.

## Clipboard & file drops

Canvas copy writes canonical markdown to the system clipboard
(`copyBlocksToClipboard` in
[`use-canvas-editor.ts`](../../src/hooks/use-canvas-editor.ts)); pasting
markdown-shaped multi-line text outside a text field parses into real blocks
(`insertMarkdownText` via
[`handleCanvasPasteEvent`](../../src/lib/canvas/canvas-keyboard-shortcuts.ts)).
The in-memory block payload wins for internal copies. `.md` file import
([`use-import-markdown-page.ts`](../../src/hooks/use-import-markdown-page.ts))
and **Export page** ([`export-page-markdown.ts`](../../src/lib/markdown-canonical/export-page-markdown.ts))
use the same codec in lenient/strict modes.

**File drops**: dropping `.md`/`.markdown`/`.txt` files onto the SIDEBAR
imports each as a new page (multi-file drops create pages in drop order and
navigate to the last); dropping them onto an open CANVAS inserts their parsed
blocks at the drop position via `parseBlocksMarkdown` (body-only — a dropped
H1 stays an H1 block, never a retitle). Image/video file drops on the canvas
insert media blocks through the same path as paste. File drags are detected
by the `Files` drag type and never collide with internal block/page drags
(`extractMarkdownFiles`/`dragHasFiles` in
[`detect.ts`](../../src/lib/markdown-canonical/detect.ts); drop composition in
[`page-list.tsx`](../../src/components/pages/page-list.tsx) and
[`page-canvas-editor.tsx`](../../src/components/canvas/page-canvas-editor.tsx)).
In dev disk mode the Development panel hides the baseline-flow actions
(Reset/Refresh) whose machinery is gated off; Save all stays as the manual
flush-and-compact action.

## Known losses (by design)

- Consecutive blank rows collapse (markdown cannot express two adjacent empty
  paragraphs); the editor's trailing-blank invariant restores on load.
- Emphasis marks that cannot legally serialize (boundary whitespace, partial
  graphemes, flanking violations) drop the styling — never the text.
- `pageLink.variant` and in-document block ids never ship (both derive).
- Bare URLs and emails in prose stay plain text — the codec runs a GFM subset
  WITHOUT autolink literals (their post-escape text transform breaks
  serializer idempotence); only explicit `<url>` autolinks become embeds.
- A toggle heading followed by a sibling DEEPER heading re-absorbs it as a
  child on parse — markdown's section semantics are the toggle's semantics.

## Deferred

Raw markdown editing mode (a view toggle over `serializeBlocksMarkdown` —
dev disk mode already provides direct file editing), inline-mark markdown
paste inside text fields, the rows-index tier implementation
(worker + IndexedDB — design locked in
[`rows-index.ts`](../../src/db/rows-index/rows-index.ts)), shipped
materialized row-page bodies (`rows/*.md`).

## Related

- [Author dev mode](./author-dev-mode.md)
- [Local-first persistence](./local-first-persistence.md)
- [Databases](./databases.md)
- [Pages](./pages.md)
- Proposal (original design): [markdown-native-content](../proposals/markdown-native-content.md)
