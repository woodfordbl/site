# Inline prose tokens

Live `{{ … }}` formula tokens inside ordinary page text — "we have
{{ count(db("Tasks")) }} open tasks" rendering as a real number that tracks the
database, not a snapshot someone has to remember to update.

Deliberately scoped as a follow-on to the
[formula language v2](./formula-language-v2.md) work: the language, engine,
editor, and template splitter all exist. What is missing is a *place to put a
token in prose*, a *page-level scope*, and a *serialization* that survives a
markdown round trip.

## What already exists

Almost the whole stack, which is why this is a wiring problem more than a
language one.

| Piece | Where | State |
|---|---|---|
| `{{ … }}` split + evaluate | [`template.ts`](../../src/lib/formula/template.ts) | Generic over any string + `FormulaScope`. String-literal-aware close scanning. Used today only by row templates. |
| Inline entity precedent | [`rich-text.ts`](../../src/lib/schemas/rich-text.ts) | `link` marks carry `href`/`pageId`; page links are **atomic runs** — clipping (`clipToPageLinkRuns`), `contenteditable=false` anchors, React-portal chrome excluded from serialization, caret escape at boundaries, and DOM repair for IME/drag intrusions. This is the template a formula token follows. |
| Dependency extraction | [`references.ts`](../../src/lib/formula/references.ts) | Yields same-row field ids, relation traversals, `databaseRefs` (whole-`db()` reads), and clock volatility. |
| Reactive values | [`formula-engine.ts`](../../src/db/formula-engine.ts) | `useFormulaOverlay(databaseId)` per database; engine owns the 60s volatile tick. |
| Editing surface | [`formula-editor-panel.tsx`](../../src/components/database/formula-editor-panel.tsx) | CM6 editor, chips, autocomplete, diagnostics, hover, preview row picker. Already hosted in three different shells. |
| Cross-database reads | [`formula-relations.ts`](../../src/lib/databases/formula-relations.ts) | `localFormulaRelationResolver()` — the one-shot pure path. |

## Two representations, one token

The token has a **markdown form** and a **runtime form**, and the codec converts
between them. Keeping them separate is what makes this losslessly serializable.

### Markdown form — frontmatter definition + body reference

```md
---
id: abc123
title: Weekly notes
formulas:
  f1:
    expression: count(db("db-tasks"))
    value: "12"
---

We have {{f1}} open tasks.
```

The definition lives once in frontmatter; the body references it by id. Three
things follow:

- **Round-trips losslessly.** Import reconstructs the token from `{{f1}}` plus
  its definition, instead of dropping it — the one genuinely lossy part of an
  expression-in-the-body design.
- **Write once, reference many.** The same `{{f1}}` can appear in several
  sentences without duplicating the expression.
- **Readable without an engine.** The cached `value` lets SSR, export, and a
  search index render `12` without loading the formula engine.

This depends on [PR #113](https://github.com/woodfordbl/site/pull/113) making
markdown canonical — it lands `pageFrontmatterSchema` and a real frontmatter
parser ([`markdown-canonical/frontmatter.ts`](../../src/lib/markdown-canonical/frontmatter.ts)),
which this extends with a `formulas` map.

### Runtime form — a sentinel, with the value rendered as chrome

In the block model the token occupies **exactly one character** — a `U+FFFC`
object-replacement sentinel — and the mark carries the id:

```ts
props.text  = "We have \uFFFC open tasks."
props.marks = [{ type: "formula", start: 8, end: 9, formulaId: "f1" }]
```

The rendered value (`12`) is **never in `props.text`**. It renders as chrome
over the atomic run, the way inline page links already render their icon and
title: a `contenteditable=false` run with React-portal chrome that is excluded
from DOM serialization
([`rich-text-dom.ts`](../../src/lib/editor/rich-text-dom.ts)).

The consequence that matters: **`props.text` never changes when a value
changes.** A re-evaluation is pure render state — no block write, no mark
shifting, no caret repair.

Plain-text fidelity comes back through one pure helper,
`projectPlainText(text, marks, values)`, which expands sentinels to cached
values. Read-only consumers call it: word count, search indexing, plain-text
clipboard, and markdown export.

### Why a sentinel, and not the value or the source

Three candidates, and the editor's own architecture decides between them.

**Source in `props.text`** (`{{f1}}` inline, what row templates do) — rejected.
`props.text` is the canonical plain string that word count, emptiness checks,
search, clipboard, and slash detection all read
([`rich-text.ts`](../../src/lib/schemas/rich-text.ts)). Raw source there means
word count counts `f1`, search never matches the value, and a caret landing
inside the token lets one keystroke produce unparseable text.

**Value in `props.text`** — rejected, and this is the non-obvious one. It reads
best, but it means an engine-driven write into the text the user is editing:

- **Write races.** The DOM is authoritative while typing — `serializeRichTextDom`
  reads `(text, marks)` back out of the live DOM on every input event. A
  re-evaluation mid-typing is either clobbered by the next snapshot writing the
  OLD DOM over the model, or yanks the field out from under the user. During IME
  composition, rebuilds are suspended entirely, so the engine's write and
  `compositionend`'s snapshot are a guaranteed last-writer-wins conflict.
- **Undo and local-first pollution.** Undo capture keys off block reference
  equality ([`use-page-canvas.ts`](../../src/db/queries/use-page-canvas.ts)),
  with suppression paths only for applying undo/redo and reverting to baseline.
  A value refresh would therefore land in Ctrl+Z history and make an untouched
  page read as locally modified against the conflict baseline — unless a third
  suppression path is threaded through both systems.
- **Caret drift.** The rebuild path restores the OLD selection offsets *clamped*
  to the new length rather than mapping them through the edit, so a `12` → `137`
  splice before the caret silently moves it.

**Sentinel + chrome** — chosen. Fixed width makes all three impossible by
construction rather than by careful handling. It is also what comparable editors
do (ProseMirror atom nodes, Lexical `DecoratorNode`, CodeMirror
`Decoration.replace` — which this repo already uses for the formula editor's own
chips), and it reuses machinery that exists here: inline page links are already
atomic `contenteditable=false` runs with portal chrome and DOM repair for
IME/drag intrusions. A formula token is a page link with a value instead of an
icon.

The cost is real and worth stating plainly: `props.text` stops being "what the
reader sees". Any read site that skips `projectPlainText` renders a stray
`\uFFFC` — in a search snippet, an OG description, an export. That is a static,
grep-auditable failure across a bounded set of call sites, traded against
stateful corruption of marks, caret, and undo history that tests can only
sample.

## Scope: `thisPage` as a superset

`thisPage` resolves on **every** page. Database row pages simply have more
fields.

**Base fields, every page.** Drawn from the page record
([`local-page.ts`](../../src/lib/schemas/local-page.ts)):

```
{{ thisPage.Title }}
{{ thisPage.CreatedAt }}
{{ thisPage.UpdatedAt }}
```

**Row pages add the database's own fields**, exactly as today:

```
{{ thisPage.Tags }}
{{ thisPage.Estimate * thisPage.Rate }}
```

The superset is deliberate: it means there is no error case to explain, no
"this page isn't a row" diagnostic to word carefully, and
`{{ thisPage.UpdatedAt }}` is useful in ordinary prose.

`db()` remains the way to read *other* databases from anywhere:

```
{{ count(db("Tasks")) }}
{{ sum(db("Tasks").map(t => t.Estimate)) }}
```

### Shadowing

A database with a column named "Created at" collides with a base field.
**Database fields win** — a user who names a column that means their column —
and the checker emits a warning (not an error) naming the shadowed base field.

### `CreatedBy` is deferred

There is no user or author model anywhere in the schema; pages carry only
`createdAt`/`updatedAt`. `CreatedBy` therefore has nothing to populate it and is
out of scope until a user model exists — better absent than always blank.

## Evaluation and reactivity

Row templates bake at materialization. Prose tokens must stay **live** — that is
the entire point of putting one in a sentence.

Per token, at render:

1. `parseFormula(expression)` → `formulaReferences(...)` gives the databases it
   reads (`databaseRefs` + traversal targets) and whether it is clock-volatile.
2. Subscribe to those databases via the engine; volatile tokens ride the
   existing 60s tick rather than a new timer.
3. On change, evaluate against a page scope and update the token's **render
   state**. No block write: `props.text` still holds the sentinel, so nothing
   touches the document, undo history, or the conflict baseline.

The page scope is a `FormulaScope` with `relations` (from
`localFormulaRelationResolver`), `now`, `userFunctions`, and a `getProperty`
serving the base page fields — plus the database row's fields when the page is a
row page. One scope shape, two levels of richness.

The cached frontmatter `value` is what renders on first paint, before the engine
has loaded; the engine then refreshes it. So a token is never blank on load, and
never permanently stale.

**The one piece that does not exist yet:** the engine's subscription is
per-database (`useFormulaOverlay(databaseId)`). A page holding tokens across
three databases needs to subscribe to several, and re-render on any. That is a
small hook over `subscribeFormulaEngine`, not a new engine — but it is new code,
and it is where a naive implementation will re-render the whole page on every
keystroke in an unrelated database.

## Editing

- **Insert:** a `/formula` slash command, plus typing `{{` in a text block.
- **Edit:** clicking a token opens the existing `FormulaEditorPanel` in a
  popover. It already runs in three shells (wide dialog, submenu, mobile sheet);
  this is a fourth. Pass the page's available fields (base fields, plus the
  database's on a row page) and the workspace `databases`, so property chips and
  `db()` completion both work.
- **Delete:** backspace at the token's trailing edge removes the whole run,
  matching page-link behavior.
- **Reuse:** the atomic run, caret-escape at the boundaries, and the DOM repair
  that lifts stray typing out of an atomic anchor all exist for inline page
  links ([`rich-text-dom.ts`](../../src/lib/editor/rich-text-dom.ts)). Extend
  them to `formula` marks rather than writing a parallel implementation, and
  extend the identity check so adjacent tokens with different `formulaId`s never
  merge ([`blocks/rich-text.ts`](../../src/lib/blocks/rich-text.ts)).
- **Preview row:** on a row page the panel's existing preview-row picker is
  meaningful; on an ordinary page it should be hidden (there is one scope).

## Errors

Same discipline as everywhere else in the formula stack: never throw. An
unparseable or failing token renders `⚠ message` inline in the run, styled like
the broken-formula chip. The page stays editable and the token stays clickable
so the expression can be fixed.

## Serialization

Frontmatter is what makes this work, so the round trip is a strength rather than
the weak spot it would otherwise be.

- **Export** writes `{{f1}}` in the body and the definition + cached value in
  frontmatter.
- **Import** reads the definition back and reconstructs the mark. This requires
  teaching the markdown layer about *one* inline mark type — today
  [`markdown-to-blocks.ts`](../../src/lib/markdown/markdown-to-blocks.ts)
  models no inline marks at all, so this is genuinely new code, but it is
  bounded to a single well-defined token rather than general inline formatting.
- **Clipboard** within the app carries the mark, so copying a sentence keeps its
  tokens live. Pasting into a plain-text target runs `projectPlainText`, so the
  value lands rather than a sentinel.

Every one of these goes through `projectPlainText`; nothing outside the editor
should ever see a raw sentinel.

**Lifecycle:** deleting the last reference to `f1` should garbage-collect its
frontmatter entry, and ids must be unique per page. Both belong in the codec,
not the editor, so a hand-edited `.md` file cannot drift.

## Phasing

Ordered so each phase is useful on its own, and so the riskiest piece is not
first.

**P0 — depends on [#113](https://github.com/woodfordbl/site/pull/113).** The
frontmatter design needs markdown-canonical content. Nothing here starts until
that lands.

**P1 — tokens with base page scope.** The `formula` mark over a `U+FFFC`
sentinel, atomic-run behavior extended from inline page links, portal-rendered
value chrome, the `formulas` frontmatter map with codec round-trip, live
evaluation against base page fields + `db()`, inline errors. Insert via slash
command; edit via popover.

Ships with `projectPlainText` and a **one-time audit** of every `props.text`
read site — word count, search indexing, clipboard, `page-to-markdown`, OG
description — routed through it. That audit is the feature's real cost and
should not be deferred; a missed site is how a stray sentinel reaches a user.

**P2 — row pages.** ✅ Page scope layers the database's fields on row and
template pages ([`page-formula-fields.ts`](../../src/lib/databases/page-formula-fields.ts),
[`InlineFormulaPageProvider`](../../src/components/editor/inline-formula-page.tsx)).
Live inline tokens evaluate against the open row (or template `rowDefaults`);
mustache `{{ … }}` tokens still bake at materialization. Shadowing *warning*
diagnostics remain deferred — collisions already favor the database field by
name, with base ids reachable as `prop("page:…")`.

**P3 — polish.** `{{` autocompletion, richer chrome (hover showing the
expression, reusing the formula editor's LSP tooltip), checker shadowing
warnings, and `CreatedBy` if a user model has appeared by then.

## Risks

- **A missed plain-text read site.** The sentinel design trades offset drift for
  this: any consumer that reads `props.text` without `projectPlainText` renders
  a stray `\uFFFC`. Static and grep-auditable, but it is now the primary risk
  and the reason the P1 audit is scoped as work rather than cleanup.
- **Performance.** A page with tokens across several databases could re-render
  often. The engine's per-database version counters and equality cutoff exist to
  prevent this; the new page-level subscription hook has to actually use them
  rather than subscribing to everything.
- **Frontmatter drift.** Definitions and body references can fall out of sync if
  a `.md` file is hand-edited — an orphaned definition, or a `{{f9}}` with no
  entry. The codec should treat a missing definition as a visible broken token,
  never a crash, and garbage-collect orphans on write.
- **Stale cached values.** The frontmatter `value` is what renders before the
  engine loads. If the engine fails to load, a stale number sits there looking
  authoritative. Worth deciding whether a token should visibly mark itself
  unrefreshed.
- **Shadowing surprise.** A column named "Created at" silently wins over the
  base field. The checker warning is the mitigation; its wording matters.

## Rejected alternatives

**Runtime markdown parsing instead of stored offsets.** Tempting once
[#113](https://github.com/woodfordbl/site/pull/113) makes markdown canonical,
but it relocates the problem rather than removing it. Offsets are event-driven
today (once per re-evaluation); a source-canonical model makes position mapping
a *per-keystroke* obligation, since `**bold**` has four characters that do not
render, so a bidirectional source↔display map is required — which is an offset
table, now ephemeral and load-bearing at once. Markdown is also normalizing and
ambiguous, so a caret pinned to a source offset can move after a reparse.

It also would not solve this feature: a token's source is `{{f1}}` and its
display is `12`, so the display side still changes length on re-evaluation.

The useful version of the idea is already shipping: #113 removes offsets from
the durable format and derives `[start, end)` at parse time
(`markdown-canonical/inline-marks.ts`). Offsets remain the in-memory editing
representation, which is the layer that genuinely needs them — the DOM bridge,
selection, split/merge, and mark toggling are all offset-based across ~12 files.
