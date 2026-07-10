# Formula Language v2 — expressions, relations, rollups, and a chip editor

Status: proposal (July 2026). Covers the language, the recompute engine, cross-database
access, and a full editor redesign (desktop + mobile).

## 1. Goals

- **Open-ended database capabilities**: relations between databases, rollups/lookups
  expressed *inside* formulas (not as a separate bolt-on field machinery), formulas that
  reference other formulas, and eventually whole-database queries from any formula.
- **All local**: evaluation stays synchronous and client-side against the in-memory
  TanStack DB collections. No server round trips.
- **Type safety**: static checking with a visible result type ("Type: number"), precise
  friendly errors before save, no silent wrong-data failures (Notion's depth-limit
  behavior is the anti-goal).
- **Desktop editing that feels like Linear**: one compact input, chips for references,
  fused keyboard-first autocomplete, transient contextual docs — not Notion's permanent
  four-pane builder.
- **Mobile as a first-class surface**: Apple Numbers is the reference interaction model;
  no competitor (Notion/Coda/Airtable) does this well, so it's a differentiator.

## 2. Where we are today (audit summary)

Engine (`src/lib/expr/`): hand-written tokenizer → recursive-descent parser → AST →
tree-walk evaluator. Solid bones (never throws, error-as-value `ExprError` propagation,
depth/length guards, AST parse cache, volatile-function detection driving a 60 s clock).
Limitations, all confirmed in code:

| Limitation | Evidence |
|---|---|
| No static types; validity = "does it parse" | `formula-editor-panel.tsx:232-241` shows only `✓ Valid` |
| Scalar-only values; no list, no real date | `evaluate.ts:30-37`; dates are ISO strings compared lexically (`evaluate.ts:505-527`) |
| Property refs resolve by *name*; renames silently break formulas | `row-scope.ts:28,90`; ids are stable and never rewritten (`database.ts:59`) but expressions store names |
| Formulas cannot reference formulas | hard guard at `row-scope.ts:95-97` ("v1 cycle safety"), no dependency DAG |
| No relations / rollups / lookups / cross-DB anything | no relation field type exists (`database.ts:13-22`); scope is single-row (`row-scope.ts:78-102`) |
| No lambdas, `let`, variables, or user functions | bare identifier is a parse error (`parse.ts:385`) |
| Whole-table recompute on any edit | `computeFormulaOverlay` over all rows, `useMemo` keyed `[allRows, fields, clockNow]` (`database-table-view.tsx:337-342`) |

Editor (`formula-editor-panel.tsx`): a plain monospace `<textarea>`. No chips, no
highlighting, no caret autocomplete — a search box + reference list below the input with
click-to-insert (`insertAtCaret`), a parse-status line, and a first-row preview. On touch
devices the whole column menu becomes a nested bottom drawer
(`menu-presentation.tsx:35-37`), fluid-width by design, but with no keyboard avoidance.

Data layer: everything favors us. Collections are in-memory with synchronous access
(`localDatabasesCollection.get(id)`, rows BTree-indexed by `databaseId`,
`local-collections.ts:186-189`); all writes flow through one transactional choke point
(`database-collection-ops.ts`); the grid is virtualized with memoized rows; formula
values are an ephemeral read-time overlay merged into row copies (`formula-values.ts`)
so the whole filter/sort/group/aggregate/chart pipeline already consumes formula columns
transparently. Cross-DB evaluation is *feasible today* — nothing is wired into
`ExprScope` yet.

## 3. Prior art — what we take from whom

- **Notion Formulas 2.0**: the language *shape* — everything-is-an-expression, first-class
  lists, `let/lets`, HOFs over lists, universal dot-chaining, relations as `list<row>`
  with `.map/.filter/.sum` replacing rollups. Also its failures: single implicit
  `current` (ambiguous nesting), silent dependency-depth failures, name-serialized chips
  causing years of paste bugs, mobile explicitly second-class.
- **Coda**: formulas usable everywhere; readable left-to-right chaining
  (`Orders.filter(...).Cost.sum()`); `WithName`-style named intermediates; typed colored
  chips per reference kind.
- **Power Fx**: display names vs logical names — formulas store stable IDs, render
  display names, renames never break anything. Blank-as-typed-value instead of
  null chaos. No truthiness.
- **Excel LET/LAMBDA + dynamic arrays**: let-bindings as memo points; once lists are
  first-class values, iteration/aggregation/lookup become ordinary composition. Named
  user functions are the composability endgame (later phase).
- **Baserow**: one grammar, static field-reference extraction from the AST at save time,
  save-time type check and cycle rejection, broken references become healable error
  states.
- **Grist**: the recompute architecture — **column-level dependency nodes with row-level
  dirty sets**, relation edges that map which rows propagate, lookup indexes for
  cross-table precision, trigger formulas as a stored-value escape hatch (future).
- **Reactively / TC39 signals**: push-pull dirty propagation, glitch-freedom, equality
  cutoff so unchanged intermediates stop propagation.
- **CodeMirror 6**: Lezer incremental parsing, `Decoration.replace` + `atomicRanges`
  chips over a plain-text source of truth, context-aware autocomplete, lint diagnostics,
  and the only serious mobile/IME story (Replit and Obsidian ship it on phones).
  Airtable's Monaco choice is why their mobile formula editing doesn't exist.
- **Apple Numbers (iPad)**: the mobile model — custom keyboard accessory row, functions
  inserted with tappable argument-placeholder tokens, tap-token-to-fill via pickers,
  token option menus, explicit commit/cancel.
- **Linear**: keyboard-first fused palette, progressive disclosure (docs in a transient
  origin-anchored popover, not a permanent pane), high density with a muted palette and
  one accent, motion anchored to the triggering element.

Rejected: HyperFormula (grid-locked A1 model, GPL-or-commercial, unswappable syntax,
~134 KB gz) and Monaco (multi-MB, no mobile). formulajs is a possible stdlib crib sheet
only.

## 4. The language

### 4.1 Value model and types

Tagged runtime values replacing `ExprPlainValue`:

```
number | text | boolean | date | list<T> | row<DatabaseId> | blank | error
```

- **date** becomes a real value type (calendar-aware comparison, date arithmetic);
  ISO strings coerce at the property boundary, not inside the language.
- **list<T>** is first-class and generic; all aggregation (`sum`, `avg`, `min`…)
  moves from variadic-scalar to list-accepting (variadic form kept as sugar).
- **row<Db>** is a typed reference to a row of a known database — the value a relation
  produces. `row.prop` accesses that database's fields with full type knowledge.
- **blank** replaces `null` and is valid in every type (Power Fx). No truthiness
  anywhere: `if()` requires boolean; `empty(x)` and `x ?? fallback` are the escape
  hatches.
- **error** stays a propagating value at runtime (current `ExprError` model is good),
  but most errors move to *check time*.

Select/multi-select: keep projecting to `text` / `list<text>` (option names) in v1 of
the language; a dedicated option type is a possible later refinement.

### 4.2 Syntax

Keep the operator set and precedence ladder, add:

- **Dot-chaining, universal**: `expr.fn(a, b)` ≡ `fn(expr, a, b)`. This is what makes
  rollups read like Coda: `Tasks.filter(t => t.Done).length()`.
- **Property access on rows**: `t.Estimate` where `t : row<Tasks>` (sugar for
  `t.prop("<fieldId>")` after autocomplete resolution — see 4.3).
- **Lambdas with named parameters**: `x => expr`, `(item, index) => expr`. No lone
  implicit `current` (Notion's documented nesting flaw). Autocomplete inserts
  `filter(item => …)` so ergonomics don't suffer.
- **`let(name, value, body)` / `lets(...)`**: named intermediates; each binding is also
  an engine memo point.
- **`??`** blank-coalescing operator; **`switch(value, case1, result1, …, default)`**
  and 2-arg `if(cond, then)` (blank else).
- Number literals gain exponent form; `^` for power.
- Line comments `//` and block comments `/* */` (multi-line formulas are expected).

Grammar stays a hand-written recursive-descent extension of `parse.ts` for the runtime
path — it's small, tested, and error-message-friendly. (A parallel Lezer grammar exists
purely for the editor; a golden test corpus keeps the two in agreement, the same
one-grammar-two-parsers discipline Baserow uses.)

### 4.3 References: stable IDs under display-name chips

The single most important correctness fix.

- **Canonical stored text** uses field ids: `prop("f_8a2c…")`, relation traversal
  `prop("f_rel…").map(r => r.prop("f_est…"))`, database refs `db("d_…")`.
- **The editor never shows ids.** Chips render the current display name + field-type
  icon; renames re-render instantly and never touch stored text.
- **Copy/paste**: plain-text copies serialize to display-name form (`prop("Estimate")`)
  for portability; a rich clipboard payload carries the id form; paste re-resolves names
  against the current schema and flags ambiguity. (Losslessness tested everywhere a
  formula can live — Notion shipped a broken version of this for two years.)
- **Deleted fields** become a "broken chip" error state that heals if the reference
  target is restored (Baserow). Deleting a field warns when dependent formulas exist
  (the dependency graph makes this a lookup).
- **Migration**: existing `thisPage.Name` expressions are parsed with the old grammar,
  names resolved to ids against the schema at migration time, rewritten to canonical v2
  text. Unresolvable names become broken chips, not data loss. `thisPage.X` remains
  accepted input syntax that normalizes to a chip.

### 4.4 Relations, rollups, and cross-DB access

Three tiers, in increasing power and decreasing dependency precision:

1. **Relation field** (new field type): cell stores `string[]` of row ids +
   `targetDatabaseId` on the field config. In formulas it evaluates to
   `list<row<Target>>`. One-directional in v1; the engine maintains a reverse index
   (target rowId → referrer rowIds) so back-references and precise dirtying work; a
   symmetric visible backlink field can come later.
2. **Rollups are formulas.** No separate rollup field machinery: the "rollup" UI is a
   template picker (relation × property × aggregation) that *generates*
   `prop("Rel").map(r => r.Estimate).sum()` and drops you into the editor. One engine,
   one mental model, and users discover the language through the sugar.
3. **`db("…")` whole-database references** (later phase): any formula can do
   `db("Enrollments").filter(e => e.Status == "Active").length()`. Dependency edges are
   coarse (any change in the target DB dirties the column), which is exactly why it
   ships after incremental recompute.

### 4.5 Type checking and diagnostics

Bidirectional checking over the AST: synthesize types bottom-up; push expected types
into lambda bodies and function arguments (so `filter(t => …)` knows `t : row<Tasks>`
and can autocomplete its fields). Function signatures move into the catalog as typed
declarations (params, optionals, variadics, generics like `list<T> → T`), which powers
the checker, autocomplete, and the docs UI from one source of truth.

Outputs:

- **Result type** for the badge (`Type: number`, `Type: list of Tasks`) and for
  downstream consumers — filters/sorts/aggregates/charts can finally know a formula
  column's type statically instead of sniffing values.
- **Diagnostics with spans** — Elm-grade: show the offending span, say what was expected
  and why, offer a one-tap fix where possible ("`sum()` needs numbers but `Name` is
  text — wrap in `toNumber()`"). Save-time policy: parse errors block save; type errors
  warn but save (column shows the error state), matching Notion's forgiving behavior
  without its silence.
- **Static reference extraction** — the list of field/relation/db edges used by the
  dependency graph and by "this field is used by N formulas" warnings.

## 5. The engine

New split: `src/lib/formula/` (pure language: lexer, parser, checker, evaluator, stdlib,
catalog — replaces `src/lib/expr/` via re-exports during transition) and
`src/db/formula-engine/` (stateful: dependency graph, caches, subscriptions).

### 5.1 Dependency graph

- **Nodes are columns**: `(databaseId, fieldId)` for formula fields, plus source nodes
  for data columns, one node per relation reverse-index, and a single **clock node** for
  `now()/today()` volatility (keeps the existing 60 s visible-tab tick).
- **Edges are static**, extracted from the checked AST at save time (Baserow), each
  annotated with a row-mapping relation (Grist): same-row for local refs,
  through-the-reverse-index for relation traversals, all-rows for `db()` refs.
- **Dirty state is row-granular**: `dirtyRows: Map<ColumnNode, Set<rowId>>`. A cell edit
  dirties exactly the dependent columns' mapped rows; evaluation walks topo order and
  batch-evaluates each column's dirty set; **equality cutoff** stops propagation when a
  recomputed value didn't change.
- **Cycles**: rejected at save time with a named-cycle error message (A → B → A). The
  `row-scope.ts:95` "formulas can't reference formulas" guard is deleted — topo order
  makes it safe.

### 5.2 Evaluation service and integration

A module-level `FormulaEngine` subscribes to the databases/rows collections (change
events from TanStack DB), maintains the graph and a value cache
`Map<dbId, Map<rowId, Map<fieldId, value>>>`, and exposes a `useSyncExternalStore`
snapshot per database (the SSR-safe pattern already established in this codebase).

`computeFormulaOverlay`/`withFormulaValues` keep their signatures but read from the
engine cache instead of recomputing — the entire downstream pipeline (filter, sort,
group, aggregate, chart, grid, row page) is untouched. Values stay unpersisted
(recomputed on load; cache is warm after first evaluation). Row-page and table view stop
double-evaluating independently.

Perf targets: 10k rows × 10 formula columns full recompute < 50 ms; single-cell edit
recompute touching only mapped dependents < 2 ms. The research is unambiguous that a
column-node/row-dirty-set design hits this comfortably at our scale.

## 6. Editor redesign — desktop

### 6.1 Architecture

CodeMirror 6, lazy-loaded (dynamic import at the panel boundary; ~80–100 KB gz amortized
only when a formula editor opens). Custom Lezer grammar for highlighting/structure;
the real checker (5.5) supplies diagnostics and types via a lint source so there's one
truth for errors.

- **Chips**: `Decoration.replace` widgets over the canonical `prop("id")` text +
  `atomicRanges` so caret/backspace treat a chip as one unit. Source of truth stays
  plain text — chips are pure presentation, which is what makes copy/paste, undo, and
  collaboration trivial.
- **Chip anatomy** (extends the existing filter-bar chip family, not the Notion look):
  `h-5 rounded-md` inline tokens in `bg-muted` with the field-type icon at `size-3.5
  text-muted-foreground`, name in `text-xs`; relation chips tint with
  `--block-bg-blue`/`--block-text-blue`, db refs purple, broken refs
  `bg-destructive/10 text-destructive` with a strikethrough name. Click a chip →
  origin-anchored menu (jump to field, replace with another property, unwrap to text).
  While we're here, extract the shared `<Chip>` primitive and align
  `database-filter-bar.tsx` + option pills on it — today every surface hand-rolls.
- **Syntax highlighting** uses the existing mono font and a restrained palette: functions
  and operators in `foreground`, literals in `muted-foreground`-adjacent block colors —
  Linear-muted, not rainbow.

### 6.2 Layout (replacing the stacked builder panel)

The permanent search-box + reference-list + detail-strip stack collapses into:

1. **The input** (auto-growing, 1–8 lines) with chips and squiggles.
2. **One fused autocomplete popover** at the caret: properties, functions, operators,
   and snippets in a single ranked list (type-aware — after `.` on a `list`, list
   methods rank first; inside `filter(t => …)`, `t`'s fields lead). `↑↓` navigate,
   `Enter`/`Tab` insert, function insert lands the caret inside the parens with
   per-argument placeholder hints.
3. **A transient info card** attached to the highlighted completion (signature, one-line
   description, example — scales out from the row, Linear-style), replacing the
   permanent `h-20` detail strip.
4. **Status line**: left — type badge (`number`) or the first diagnostic; right —
   preview against a pickable row (keep first-row default, add a row switcher like
   Notion's "Preview with"), and Save (`⌘Enter`).

The column-menu submenu width (360 px) stays; the panel simply gets denser and loses two
permanent zones.

## 7. Editor — mobile

The formula editor escalates from the nested menu drawer to a **full-height sheet**
(keyboard-aware via `visualViewport`), because formula editing needs the vertical room.

- CM6 handles touch caret/IME natively (its core advantage over Monaco/textarea-overlay
  approaches).
- **Accessory row** pinned above the virtual keyboard (Numbers' operator row):
  `( ) , " + - * / . ==` plus two leading buttons — **property** (opens the field picker
  sheet) and **fn** (opens the function browser sheet). Targets at `pointer-coarse:h-10`,
  haptics via the existing provider.
- **Argument placeholder tokens**: inserting `dateAdd(…)` renders placeholder chips for
  `date`, `amount`, `unit`; tapping one selects it and — when the expected type is
  closed (a property, a unit enum, an option) — opens a picker sheet instead of the
  keyboard. This is the Numbers trick that makes touch editing feel assisted rather than
  fiddly.
- **Chip tap = menu, not caret gymnastics**: tapping a chip opens its option menu;
  dragging the caret is never required for the common paths.
- Explicit **Cancel / Done** in the sheet header; diagnostics render as a tappable
  status pill that expands the message.
- The rollup template picker (4.4) matters most here — on mobile, most users compose
  rollups without ever touching the keyboard.

## 8. Ripple effects on other surfaces

- **Filters**: keep structured filters, but formula columns now expose their static type
  so operator menus are correct (today they text-match the display string,
  `row-filter.ts:47`). Later option: "advanced filter" = any boolean formula.
- **Aggregates/charts**: `row-aggregate.ts` gains list-aware handling; charts can use
  typed formula columns as X or Y with confidence.
- **Templates**: `{{ … }}` tokens (`row-template.ts`) ride the same v2 engine and get id
  migration for free.
- **Docs**: update `docs/architecture/databases.md`; add
  `docs/architecture/formula-language.md` (grammar, types, engine) when P1 lands.

## 9. Phasing

Each phase ships independently and is flag-safe.

- **P0 — Groundwork (small)**: id-based reference canonical form + migration of stored
  expressions and templates on the *existing* engine (rename bug dies immediately);
  shared `<Chip>` primitive extracted and adopted by the filter bar.
- **P1 — Language core**: `src/lib/formula/` with the v2 value model, grammar
  extensions, typed catalog, checker, evaluator; old engine swapped out behind the
  existing `computeFormulaOverlay` seam; formula-on-formula enabled via same-DB topo
  sort; type badge + real diagnostics surfaced in the *current* panel UI. Heavy golden
  tests (every catalog example, checker suite, migration corpus).
- **P2 — Desktop editor**: CM6 panel with chips, fused autocomplete, info card,
  diagnostics, preview row picker. Lazy-loaded.
- **P3 — Relations + rollups + incremental engine**: relation field type end-to-end
  (schema, cell UI, row picker), reverse index, full dependency graph with row-level
  dirty sets and equality cutoff, rollup template picker generating formulas.
- **P4 — Mobile editor**: full-height sheet, accessory row, placeholder tokens, picker
  sheets, keyboard avoidance.
- **P5 — Open-ended power**: `db()` whole-database references, `let` statement sugar,
  named user-defined functions (Sheets Named Functions model), boolean-formula advanced
  filters, per-group aggregates.

Suggested order rationale: P1 before P2 so the editor is built against real types and
diagnostics; P3 before P4 so mobile launches with rollups (its best demo); incremental
recompute lands with P3 because that's when fan-out first makes whole-table recompute
expensive.

## 10. Risks and open questions

- **CM6 bundle** (~80–100 KB gz): mitigated by lazy-loading at the panel; acceptable.
- **localStorage scale**: relations increase row fan-out and formula chains increase
  recompute reach; the sharded row storage holds, but a move to IndexedDB/OPFS is a
  separate track if databases grow past a few MB.
- **Undo**: engine values are derived (no undo needed), but schema edits (delete a field
  used by 12 formulas) need the dependency-aware warning dialog; full schema undo is out
  of scope here.
- **Two grammars drift** (Lezer for the editor, RD for the runtime): held together by a
  shared golden corpus test, and the checker — not Lezer — owns diagnostics.
- **Select option identity in formulas** (name-vs-id): v1 keeps names-as-text;
  revisit if option renames in formulas become a reported papercut.
- **Collaboration/multi-tab**: engine caches are per-tab; storage events already
  propagate row changes, and the engine treats them like any other change. No new
  consistency machinery needed until real multi-writer sync exists.
