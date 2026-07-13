# Formula language

The v2 formula engine behind database formula fields and `{{ … }}` row-page
templates. Pure language modules live in [`src/lib/formula/`](../../src/lib/formula/)
(React-free, never-throwing); database integration lives in
[`formula-values.ts`](../../src/lib/databases/formula-values.ts). Design history and
future tiers: [formula-language-v2 proposal](../proposals/formula-language-v2.md).

## Pipeline

| Stage | Module | Produces |
|-------|--------|----------|
| Tokenize | [`tokenize.ts`](../../src/lib/formula/tokenize.ts) | `eof`-terminated token stream with 0-based spans (`position` inclusive, `end` exclusive) |
| Parse | [`parse.ts`](../../src/lib/formula/parse.ts) | Typed AST ([`ast.ts`](../../src/lib/formula/ast.ts)), every node span-exact |
| Check | [`check.ts`](../../src/lib/formula/check.ts) | Result type, positioned diagnostics, static reference list |
| Evaluate | [`evaluate.ts`](../../src/lib/formula/evaluate.ts) | A `FormulaValue`, dispatching functions off [`catalog.ts`](../../src/lib/formula/catalog.ts) |
| Display | [`display.ts`](../../src/lib/formula/display.ts) | Human string (`formulaValueToDisplay`) and plain-text coercion (`formulaValueToText`) |

Every stage returns Results or values — none throws. `parseFormula` caps input at
10,000 characters and grammar nesting at depth 100 (`MAX_PARSE_DEPTH`), which also
bounds AST depth so recursive consumers (checker, evaluator, `walkFormula`) can never
overflow on a parsed tree. `evaluateFormula` wraps the walk in a boundary catch that
degrades any internal exception to an `Internal formula error: …` value.

## Value model

Runtime values ([`values.ts`](../../src/lib/formula/values.ts)) are plain JS scalars
plus small `instanceof`-discriminated classes:

| Value | Representation |
|-------|----------------|
| number / text / boolean | plain `number` / `string` / `boolean` |
| blank | `null` — valid in every type, replaces null-chaos (Power Fx model) |
| date | `FormulaDate` — an instant + `dateOnly` flag (flag affects display and calendar-math defaults only; comparisons use the instant) |
| list | plain array, elements any `FormulaValue` |
| row | `FormulaRowRef` (databaseId + rowId) — the value a relation cell produces (one ref per linked row). Member access resolves lazily through the scope’s relation resolver (see [Relations](#relations)); refs compare by database + row id |
| lambda | `FormulaLambda` — params + body node + captured environment (persistent linked-list frames); a value only so higher-order functions can apply it |
| error | `FormulaError` — a value, never a thrown exception |

**No truthiness**: `if`/`and`/`or`/`not` require booleans; `empty(x)` and `x ??
fallback` are the escape hatches. **Error-as-value propagation**: any error operand
wins through operators and eager arguments; only lazily-evaluated branches are exempt.
`formulaValuesEqual` defines `==` for the operator, `switch`, `includes`, and
`unique`: mismatched types are unequal (not an error), blank equals only blank, dates
compare by instant, lists element-wise, lambdas by reference.

Evaluation runs against an injected `FormulaScope` (`getProperty` + optional `now` +
optional `relations`).
Without a clock, `now()`/`today()` report the fixed epoch `FORMULA_FIXED_NOW_ISO` so
pure callers stay deterministic; interactive callers inject the real clock.

## Syntax

Conventional precedence: `??` < `or` < `and` < `==`/`!=` < comparisons < `+`/`-` <
`*`/`/`/`%` < unary < `^` (right-associative, parses to `pow`) < postfix `.name` /
`.fn(…)`. Beyond the retired v1 grammar (everything it accepted still parses to
equivalent shapes, guarded by the frozen
[`corpus.fixture.ts`](../../src/lib/formula/corpus.fixture.ts) golden corpus):

- **Dot-chaining desugar** — `expr.fn(a)` parses to the same call node as
  `fn(expr, a)` with the receiver prepended and `method: true`, so rewriters can print
  the chain back in its original shape. Bare member access (`r.Estimate`) is a
  `member` node; whether it exists is the checker's concern. **Bracket member
  access** — `r["Story Points"]` parses to the exact same `member` node as the dot
  form, for names that aren't identifiers or that the grammar reads specially
  (`r.not` would lex as the keyword). Deliberately conservative: only `[` immediately
  followed by a string literal is member access; everything else (`[1, 2]`, `f()[0]`)
  keeps its list-literal meaning or original diagnostic.
- **`let(name, value, body)` / `lets(…)`** — named intermediates. Evaluator special
  forms (they bind names from raw AST nodes), not catalog entries; same for `prop`
  and `db`, which are syntax parsing straight to property/database nodes (only the
  single-string-literal form is special — `db(expr)` is a parse error naming the
  constraint).
- **`let` statement sugar** — at the top level only, a formula may open with
  `let <name> = <expression>;` lines before its final expression:

  ```
  let tax = 0.1;
  let total = prop("f-price") * (1 + tax);
  round(total, 2)
  ```

  Pure parser sugar: each statement desugars to the exact nested
  `let(name, value, body)` call node the call form parses to (here
  `let(tax, 0.1, let(total, …, round(total, 2)))`), so the checker, evaluator,
  rewriters, and engine see nothing new. Both syntaxes coexist — `let` followed by
  `(` is the call form, `let` followed by an identifier (in top-level statement
  position) is the statement form; everywhere else `let` stays an ordinary
  identifier (bare name reference, lambda parameter). A trailing `;` after the
  final expression is tolerated; a `;` anywhere else is a parse error with a hint,
  as is a lone `=` (both are tokens only so these statements can lex). Statement
  names reject the reserved words plus the reference roots
  (`prop`/`db`/`thisPage`/`thisRow`, which could never be read back). Each
  statement spends one level of the parse-depth budget, preserving the
  "parse depth bounds AST depth" contract.
- **Lambdas** — `x => expr`, `(a, b) => expr`; body extends maximally right. Named
  parameters only — no implicit `current`. Lambda application is depth-capped
  (`MAX_CALL_DEPTH` 100) because higher-order recursion is otherwise unbounded.
- **Lazy forms** — `if`/`switch`/`and`/`or` are `kind: "lazy"` catalog entries
  receiving memoized thunks; `&&`/`||` and `??` (→ `coalesce`) short-circuit in the
  evaluator. Untaken branches never evaluate, so errors don't propagate through them.
- **Also new**: list literals `[a, b]`, exponent number literals (`2.5e-3`), `//`
  line and `/* */` block comments, bare-identifier name references (lambda params and
  `let` bindings).

## Property references: id-canonical

The stored form of a property reference is **`prop("<fieldId>")`** — field ids are
stable, so renaming a field never touches (or breaks) any stored formula. The display
forms `thisPage.Name` / `thisRow["Name"]` remain accepted input; the AST records
which spelling was used (`via: "prop" | "scope"`).

- [`ref-rewrite.ts`](../../src/lib/formula/ref-rewrite.ts) converts between the two by
  splicing property-node spans right-to-left, so spacing/casing/comments are never
  reformatted: `canonicalizeExpression` resolves names → ids (normalized
  case-insensitive match, first field in schema order on collisions; a name-form
  `prop("Estimate")` canonicalizes too); `humanizeExpression` is the inverse for the
  editor. Unknown ids stay as visible `prop("id")` — a broken reference, not data
  loss; unparseable input passes through unchanged. Both rewriters take an optional
  `databases` list (`FormulaRefDatabase[]`) applying the identical rules to
  `db("…")` references: `db("Enrollments")` ⇄ `db("<dbId>")`, id matches kept,
  unknown references left visibly broken, never reported as unresolved names.
- [`row-scope.ts`](../../src/lib/formula/row-scope.ts) resolves at evaluation time by
  exact field id first, then normalized name (`normalizeFormulaPropertyName`, the same
  rule the checker and rewriters use — the three can never disagree). Cell → value
  mapping mirrors the checker's `formulaPropertyValueType`: text/url/select → text,
  number → number, checkbox → boolean, date → date-only `FormulaDate`, multiSelect →
  a real list of option names, empty/mistyped → blank. `relation` fields exist in
  `FormulaFieldKind` but stay compile-neutral for now: they type as unknown and
  evaluate as blank until the relation evaluation stage lands (`list<row>` values).
- **Startup migration** —
  [`formula-ref-migration.ts`](../../src/db/queries/formula-ref-migration.ts)
  (wired in `startLocalCollectionsSync`,
  [`local-collections.ts`](../../src/db/collections/local-collections.ts)) rewrites
  every stored name-form expression to the id form once the databases collection is
  live. Idempotent (unchanged expressions are never written) and lossless
  (unresolvable names pass through and surface in the UI).

## Function catalog

[`catalog.ts`](../../src/lib/formula/catalog.ts) is the single source of truth for
the stdlib: each entry carries the typed signature (params/returns over
[`types.ts`](../../src/lib/formula/types.ts)), the docs (description + examples —
tests assert every example parses and evaluates cleanly), and the implementation, so
the checker, evaluator, and editor reference UI can't drift. Arity and top-level
argument-type errors are generated generically from the signature; `lenient` params
opt out and coerce inside the implementation (preserving v1 text-coercion behavior).
`FORMULA_OPERATOR_CATALOG` feeds the editor's Operators section;
`VOLATILE_FORMULA_FUNCTION_NAMES` (`now`/`today`) drives volatility detection.

## Static checker

`checkFormula(ast, context)` ([`check.ts`](../../src/lib/formula/check.ts)) is
bidirectional: types synthesize bottom-up, expected types push into function
arguments and lambda bodies via the catalog signatures. One pass produces:

- **`resultType`** — for the editor's type badge (`formulaTypeBadge`: unions read
  "number or text" with blank members suppressed for display) and for downstream
  consumers. Unions are built by `unionTypeOf` and collapse to `unknown` past 4
  members ([`types.ts`](../../src/lib/formula/types.ts)).
- **`diagnostics`** — span-accurate errors, anchored at operators where relevant.
- **`references`** / **`unresolvedNames`** — static reference extraction: field ids
  used by the formula (unresolved ids included, so dependency tracking can heal a
  restored field) and name references that matched no field.

The checker is deliberately **optimistic**: a union argument passes when any member
fits, `unknown` accepts and is accepted everywhere, and a node that produced a
diagnostic synthesizes `unknown` — one mistake yields one diagnostic, never a cascade.
Blankness is a runtime concern: properties type as their plain cell type and per-row
blank failures surface as ⚠ cells, not check errors. Checking never throws.

## Database integration

[`formula-values.ts`](../../src/lib/databases/formula-values.ts) computes formula
cells at read time as a pure overlay — values never enter `row.values` (see
[databases — Formula fields](./databases.md#formula-fields) for the view-pipeline
side). Per `computeFormulaOverlay` call:

1. **Plan** — each formula field's expression parses once (cached by expression
   string) and checks once (never per row); `checkFormula(...).references` filtered to
   formula fields gives the formula→formula edges.
2. **Cycles** — detected up front by DFS; every member of a cycle yields a named error
   for all rows (`Circular reference: Total → Subtotal → Total`), and references INTO
   a cycle propagate that error value.
3. **Order** — remaining fields sort topologically (Kahn), then evaluate
   **column-major**: each field's values land in a per-row `resolved` map that the
   next field's scope reads lazily, so formula-on-formula works without a persistent
   dependency graph.
4. **Projection** — results become `{ cellValue, display, isError }`: errors,
   non-finite numbers, and non-cell shapes (lambdas, rows) collapse to `null` so
   filters/sorts/aggregates treat them as empty; dates project to ISO strings, lists
   to display strings. Blank and parse-error expressions yield null cells, shadowing
   stale stored values under the field id.

`computeFormulaRowValues` runs the same plan for ONE row (editor preview, template
tokens). `formulaFieldTypes` / `formulaCheckContext` type formula fields in
the same topological order, so a formula referencing another formula checks against
its dependency's real result type. `hasVolatileFormula` flags clock-dependent
schemas; `formulaDisplayInfo` supplies the parse-error badge on column headers.

Since P3.3b these pure entry points are the **one-shot** path (editor preview drafts,
row templates, tests); the table view and the row-page properties panel read the
[engine shell](#engine-shell)'s cached overlay instead — same projection, same
results (a parity test pins engine output to `computeFormulaOverlay` byte-for-byte),
plus reactivity to cross-database edits and the engine-owned volatile tick.

## Relations

A relation cell evaluates to `list<row<Target>>`, so rollups are plain formulas:
`prop("Rel").map(r => r.Estimate).sum()`.

**Typing** ([`check.ts`](../../src/lib/formula/check.ts)): a relation property types
as `listTypeOf(rowTypeOf(targetDatabaseId))` (`FormulaCheckProperty.targetDatabaseId`
carries the link). Member access `r.Estimate` resolves by field NAME (field id
accepted too) against the receiver row’s database in the optional
`FormulaCheckContext.databases` map (`formulaCheckContext(fields, relatedDatabases)`
builds it, typing each related schema’s formula fields through the same topological
pass). Unknown members diagnose naming the database (`"Estimate" isn’t a property of
Tasks`); member access on a definite non-row diagnoses, with a `.map` hint when the
receiver is a whole relation list; an anonymous row type or a database missing from
the map checks optimistically. **Name-based member access is a v1 limitation**:
renaming a target field breaks formulas that reference it by name — member
references are not id-canonicalized the way same-row `prop("…")` references are
(member canonicalization belongs to the dependency-graph stage).

**Evaluation** ([`row-scope.ts`](../../src/lib/formula/row-scope.ts)): relation cells
project to `FormulaRowRef` lists — ALWAYS a list: a blank cell is the EMPTY list
(rollups over unlinked rows aggregate to 0/empty, never blank), and stale target-row
ids are SKIPPED. Members resolve through the pure-layer `FormulaRelationResolver`
interface ([`values.ts`](../../src/lib/formula/values.ts)) riding on the scope:
`database(id)` exposes a target’s schema/name/primary field and per-row values;
`formulaValue(databaseId, rowId, fieldId)` computes a FORMULA member through the
target database’s own per-row plan. Blank receivers propagate blank
(`rel.first().Estimate` over no links is blank); non-row receivers error with the
checker’s exact messages.

**Implementation** ([`formula-relations.ts`](../../src/lib/databases/formula-relations.ts)):
`localFormulaRelationResolver()` reads `localDatabasesCollection` /
`localDatabaseRowsCollection` synchronously, caching each target’s rows per
instance — call sites create a fresh resolver per compute pass. Cross-database reads
through it are **non-reactive one-shots**, which is now fine for its remaining
callers (editor preview, templates, column-menu type resolution): the P3.2
"target edits don’t retrigger views" limitation is **resolved for views** by the
[engine shell](#engine-shell), whose subscriptions dirty referrer rows precisely.
Cross-database formula cycles are guarded at evaluation time by a visiting set keyed
by (databaseId, fieldId, rowId) — re-entry returns a named error
(`Circular reference: Tasks.Calc → Projects.Rollup → Tasks.Calc`); same-database
formula-on-formula still flows through the overlay’s topological plan. (The engine
never uses this resolver — its formula members read the engine cache, see below.)

**Display**: a row ref renders as its target row’s primary-field text ("Untitled"
fallback — the relation chip rule) via `formulaValueToDisplay(value, { rowLabel })` /
`formulaRowLabelOf(relations)`; lists of rows comma-join like any list, and
`formulaValueToCellValue` projects rows/row lists to those titles for the merged-row
pipeline. The type badge reads "row" / "list of rows".

## Whole-database references (db)

Any formula can read a whole database (proposal §4.4 tier 3):
`db("Enrollments").filter(e => e.Status == "Active").length()`.

**Syntax**: `db("…")` is syntax exactly like `prop` — the parser reserves the
word (case-insensitively; it stays usable as a lambda parameter name) and only
the single-string-literal form is the special form, parsing to a database node
whose literal span feeds id-anchored diagnostics; `db(expr)` is a parse error
naming the constraint. Canonical stored text holds the database ID
(`db("<dbId>")`, rename-proof); the display form holds the database NAME
(`db("Enrollments")`), translated by `ref-rewrite.ts` exactly as property
references are. The highlighter classifies the whole reference as one property
span, and `formulaDbIdSpans` ([`highlight.ts`](../../src/lib/formula/highlight.ts))
locates db spans token-level for the editor's chip pass, mirroring
`formulaPropIdSpans`. In the CM6 editor a db span renders as an atomic
**database chip** — purple tone, database glyph, current name — with database
entries in the fused autocomplete and a Change-database chip menu; see
[Editor panel](#editor-panel) for the full treatment.

**Typing** ([`check.ts`](../../src/lib/formula/check.ts)): `db(id)` types as
`listTypeOf(rowTypeOf(id))` — the exact type a relation cell into that database
has — so member access, `.map`/`.filter`, and rollup aggregation compose
unchanged. An id missing from `FormulaCheckContext.databases` diagnoses
`"…" isn't a database` at the string literal's span (message shared with the
evaluator via `formulaUnknownDatabaseMessage`); without a `databases` map the
reference types optimistically as a list of anonymous rows.

**Evaluation** ([`row-scope.ts`](../../src/lib/formula/row-scope.ts)
`resolveFormulaDatabaseRows`): the value is the target database's rows as a
`FormulaRowRef` list — the same shape a relation cell produces, so member
reads, cross-database formula members, and the cross-database cycle guard
(the resolver's visiting set) behave identically. Row ids come from the
`FormulaRelationResolver`'s optional `rowIds(databaseId)` extension (live rows
only — no stale ids to skip): `null` means "no such database" (error value
naming it), and a resolver without `rowIds` reads as "Database references are
not available here" — an error value, never a throw. Both resolvers implement
it: `localFormulaRelationResolver` off its per-instance row scan, the engine
shell off its row mirrors.

**Dependency edges are COARSE** — the whole point of shipping db() after the
incremental engine: any change in the target database (cell edits
member-precise, row inserts/deletes, schema changes) dirties EVERY row of the
referencing column (`FORMULA_ALL_ROWS`). See the engine sections below for the
`databaseRefs` extraction, the `allRows` edge mapping, and the dirty-event
composition.

## Incremental engine core

[`src/lib/formula-engine/`](../../src/lib/formula-engine/) is the **pure core** of the
cross-database incremental engine (proposal §5.1, stage P3.3a): snapshots in, plain
data out — no collections, no subscriptions, no instances. The stateful shell
([engine shell](#engine-shell), P3.3b) owns the singleton instance, rebuilds the
graph on schema change, feeds it collection events, and wires the resolver's
`formulaValue` to the value cache.

**Static references** ([`references.ts`](../../src/lib/formula/references.ts)):
`formulaStaticReferences(ast, context)` extracts what a formula reads — same-row
field ids (the checker's own reference list), relation **traversals**, and clock
volatility. Traversals come from a provenance walk: relation properties mint tracked
sources that flow through row-preserving list functions, lambda params, `let`
bindings, `if`/`switch` branches, `??`, and list literals; each member access emits a
precise `(relationFieldId, memberFieldId)` traversal, and a source consumed opaquely
(`length()`, operators, escaping as the result) degrades to `memberFieldId: null`
("any target field"). Chained hops compose: `Rel.first().Steps.first().Hours` yields
one traversal per hop, each knowing its owner (`sourceDatabaseId`) and target
database. A failed walk degrades to "no traversals" — never throws.
`db("…")` references ride the same provenance walk but come out as separate
`databaseRefs` (`{ targetDatabaseId, memberFieldId }` — same member-precision
rules, no relation field to map rows through); a member resolving to a
relation field of the target chains into an ordinary relation traversal whose
source database is the db ref's target.

**Column graph** ([`graph.ts`](../../src/lib/formula-engine/graph.ts)):
`buildFormulaGraph(databases)` — nodes are formula COLUMNS keyed
`databaseId:fieldId`; edges are formula→formula dependencies annotated with a **row
mapping**: `sameRow` (dependency in the same database) or
`viaRelation { relationFieldId, sourceDatabaseId }` (read through a traversal, so a
changed target row maps to referrer rows via the relation's reverse index).
Cross-database edges exist ONLY for traversals naming an explicit formula member —
null-member traversals never edge, so opaque consumption (`Rel.length()`) can't
manufacture false cycles. `db("…")` references follow the same explicit-member
rule with the coarse `allRows` mapping (any changed target row dirties every row
of the referencing column — no reverse index exists for a whole-database read),
and cycles built purely from db() formula members reject with the same
db-qualified naming. Cycles reuse the overlay's naming
([`topo.ts`](../../src/lib/formula-engine/topo.ts) is shared by both), db-qualified
when the cycle spans databases (`Circular reference: Projects.AF → Tasks.BRoll →
Projects.AF`); cycle columns are excluded from the global topological order and
carry a named error value, while their dependents evaluate normally and propagate
it. The graph also lists every traversed relation field for reverse indexing.

**Reverse indexes** ([`reverse-index.ts`](../../src/lib/formula-engine/reverse-index.ts)):
per traversed relation field, `targetRowId → Set<sourceRowId>`, built from the RAW
stored id lists — stale ids included, so creating/restoring a target row can dirty
exactly the referrers whose refs un-skip. `applyFormulaRelationDiff` maintains an
index incrementally (link/unlink/retarget, no-op for un-indexed fields).

**Dirty events** ([`dirty.ts`](../../src/lib/formula-engine/dirty.ts)): pure
functions mapping input events to per-column dirty ROW sets (`FormulaDirtyMap`),
with the explicit `FORMULA_ALL_ROWS` sentinel for coarse events. A data-cell change
dirties same-database referencing columns (same row) plus traversing columns
elsewhere, member-precise, mapping target rows back through composed reverse indexes
(chained hops C→B→A). A relation-cell change updates the index FIRST, then dirties
like a data cell. Row add/remove implement stale-id semantics (referrers dirty on
both; a removed row keeps its entries as a TARGET since stored cells still hold the
id). Schema change marks the database's columns and inbound readers (traversals and
db refs alike) all-rows (the caller rebuilds the graph first); the 60s clock
tick marks volatile columns. Columns holding a `databaseRefs` entry into the
changed database dirty `FORMULA_ALL_ROWS` on any member-matching event, and a
chained mapping that reaches a db-referenced database short-circuits to
all-rows too (`db("B").map(b => b.RelC…)` — a C edit maps to B rows through
the reverse index, then coarsens).

**Incremental evaluation** ([`evaluate-dirty.ts`](../../src/lib/formula-engine/evaluate-dirty.ts)):
`evaluateDirtyFormulas` consumes the dirty map in the graph's global topological
order, re-evaluating exactly the dirty (column, row) cells into a caller-owned
`FormulaValueCache` through the same scope machinery the overlay uses. **Equality
cutoff**: dirtiness propagates to dependents only when the recomputed value differs
(`formulaValuesEqual`, errors compared by message) — per-row, so an edit that leaves
a formula's value unchanged stops the cascade cold. Cycle columns never evaluate:
their named error seeds the cache and dirties dependents through the same cutoff.
Cell projection is shared with the overlay via
[`project.ts`](../../src/lib/formula-engine/project.ts) (`formulaCellResultOf` — the
one "value → `{ cellValue, display, isError }`" rule), and the `onEvaluate` hook
lets tests assert evaluation COUNTS instead of wall-clock.

## Engine shell

[`src/db/formula-engine.ts`](../../src/db/formula-engine.ts) (proposal §5.2, stage
P3.3b) is the **stateful singleton** over the pure core: it subscribes to
`localDatabasesCollection` / `localDatabaseRowsCollection` (`subscribeChanges`),
mirrors both, owns the graph + reverse indexes + `FormulaValueCache`, and serves
per-database `FormulaOverlay` snapshots to React.

- **Lifecycle** — created lazily by the first subscriber, never on the server
  (`subscribe` no-ops without `window`; the server snapshot is a shared empty
  overlay, the SSR-safe `useSyncExternalStore` pattern). On start it builds the
  graph from every database, marks every formula column `FORMULA_ALL_ROWS` dirty,
  and runs one synchronous **warm pass** — the warm-cache invariant: the
  incremental evaluator reads non-dirty same-row dependencies straight from the
  cache, so the cache must be fully populated before any incremental pass. Once
  started it stays alive (HMR disposes; the next subscriber rebuilds).
- **Resolver wiring** — passes evaluate with a resolver whose `database()` reads
  the engine's mirrors, whose `formulaValue()` reads the **engine cache only**
  (cache miss → blank, the stale-ref rule), and whose `rowIds()` enumerates the
  row mirrors for `db("…")` references (known-but-empty database → empty list,
  unknown id → null). It never falls back to
  `localFormulaRelationResolver` — an on-demand recompute would bypass the graph's
  static cycle guard and re-derive values mid-pass.
- **Event mapping** — row updates diff old/new cells per field (the previous row
  always taken from the engine's own mirror): relation fields →
  `formulaRelationCellChanged` (old/new target ids), others →
  `formulaDataCellChanged`; inserts → `formulaRowAdded`; deletes →
  `formulaRowRemoved` **plus** `evictFormulaCacheRow` (the core never evicts). Any
  databases-collection change is the coarse path: rebuild graph + reverse indexes
  synchronously, prune cached cells for columns that no longer exist, then
  `formulaSchemaChanged` per changed database. Synchronous bursts coalesce into
  one evaluation pass via a queued microtask.
- **Snapshots** — `useFormulaOverlay(databaseId)` returns a per-database overlay
  with a STABLE reference, replaced only when that database's cache changed
  (per-database version counters; affected databases = initially-dirty columns'
  owners + every database `onEvaluate` touched — propagation during a pass can
  cross databases — + evictions/prunes). Only affected databases' subscribers are
  notified, so a Tasks edit re-renders the Projects view exactly when a rollup
  actually read it.
- **Clock** — the engine owns the 60s volatile tick (`formulaClockTick` + pass),
  running only while subscribers exist and the tab is visible (immediate refresh
  on return); each pass evaluates against one captured instant.

The table view (`database-table-view.tsx`) and the row-page properties panel
consume the hook (`withFormulaValues` still merges into row copies); the view's
own display clock now ticks only for relative dates and relative filter windows.
Cross-database reads are therefore **reactive for views**; the editor panel's
draft preview and row templates remain one-shot pure-path evaluations.

## Editor panel

[`formula-editor-panel.tsx`](../../src/components/database/formula-editor-panel.tsx)
(the Edit-property builder): on fine pointers the column menu's "Edit property" item
closes the menu and opens a **wide dialog** (hosted by `DatabaseColumnMenu` so it
outlives the menu, same pattern as the icon picker) rendering the panel's two-column
`layout="wide"` form — taller editor, status, preview, and Save on the left; the
reference browser and detail strip on the right. Coarse pointers render the panel's
mobile `layout="sheet"` form inside the submenu drawer (see **Mobile sheet** below).
The draft state is the **canonical**
expression (`prop("<id>")` / `db("<id>")` — exactly what gets stored), so
parse/check/preview/save
operate on it directly; Save runs one final idempotent `canonicalizeExpression` to
catch typed name refs the editor hasn't converted yet. The panel's
`relatedDatabases` prop threads into every `canonicalizeExpression` /
`humanizeExpression` call (textarea display and change, Save, the wizard's
generated-expression splice) so `db("…")` references translate name↔id
exactly as property references do, and `database-column-menu.tsx` passes the
same list to its save-comparison canonicalize so a stored name-form db ref
can't false-positive as "changed". The plain textarea (coarse
pointers, and the fallback on fine ones) displays `humanizeExpression(draft)` and
re-canonicalizes on every change — humanize∘canonicalize is display-stable, so
textarea users still only ever see names. Status line shows the first parse error or
checker diagnostic or "✓ Valid" plus the result-type badge; positions are 1-based
characters into what the user SEES — the panel's `referenceDisplayOffset`
(merging `formulaPropIdSpans` + `formulaDbIdSpans`, the same arithmetic as
[`highlight.ts`](../../src/lib/formula/highlight.ts)'s prop-only
`formulaDisplayOffset`) maps canonical offsets past
each `prop("<id>")` / `db("<id>")` span's display length (the chip's
field-name / database-name label in the CM6
editor, the humanized reference in the textarea). A live preview evaluates the draft against
the first row through the same scope the overlay uses (other formulas resolve to
their computed values). Save/Done require a **valid** formula — blocked by parse
errors and by checker diagnostics, so broken drafts never persist — while
blank/whitespace drafts stay saveable (clearing a formula is legitimate). The
searchable Properties / Functions / Operators reference inserts at the caret, docs
sourced from the catalog.

On fine pointers — and on coarse ones in the sheet layout — the expression input is
[`formula-code-editor.tsx`](../../src/components/database/formula-code-editor.tsx),
a CodeMirror 6 editor **lazy-loaded** at the panel boundary (`React.lazy`, plain
textarea as the Suspense fallback) so CM6 stays out of the main bundle; coarse
pointers outside the sheet keep the textarea. The CM6 doc is the
canonical text; canonical property spans (located token-level by
`formulaPropIdSpans`) render as **atomic schema-labeled chips**:
`Decoration.replace` widgets (TokenChip-styled DOM built without React — field-type
icon from `DATABASE_FIELD_TYPE_ICON_NODES`, emoji custom icons inline, `tabler:`
custom glyphs fall back to the type icon) provided as `EditorView.atomicRanges`, so
arrows skip a chip, backspace deletes the whole reference, and selection treats it
as one unit. Chip labels recompute from the live schema (a rename while the editor
is open relabels chips in place); unknown ids render a destructive strikethrough
"Unknown property" chip. Property rows insert canonical `prop("<id>")` text with
the caret placed after the chip; hand-typed `thisPage.X` stays plain highlighted
text and converts to a chip (via `canonicalPropertyRewrites`) once the doc parses,
on a short debounce, and only when the caret isn't touching the reference's span —
conversion never fights the caret mid-word.

`db("<dbId>")` spans are chips of the same cloth: **database chips** (purple
TokenChip tone against the property chips' blue, the database glyph, the
current database name) built by the same decoration pass — one shared
`referenceChipSpans` list (prop + db spans merged) feeds decorations,
diagnostics (chip rings + squiggle widening), and tap resolution, so the
three can't disagree about what is a chip, and atomicity, whole-chip
backspace, the diagnosed ring, and baseline alignment carry over unchanged.
Labels come from a `databases` prop (`FormulaRefDatabase[]` — the panel
threads its `relatedDatabases` through) held in a `chipDatabases` state field
exactly like `chipFields`, so a database rename relabels open db chips live;
ids matching no database render destructive strikethrough "Unknown database"
chips. Because the chip pass is token-level, a hand-typed name form
`db("Tasks")` chips the moment it completes — as an unknown chip, names not
being ids — and the same debounced canonicalizer pass rewrites it to the id
form once the caret leaves the span (`canonicalDatabaseRewrites`, composed in
the editor from the lib's exported primitives with `canonicalizeExpression`'s
exact rules: id matches kept, normalized-name matches rewritten, first
database in list order on collisions; token-level rather than parse-gated,
matching what already renders as a chip mid-keystroke). Soft-wrapped, autogrowing, no line
numbers; Mod+Enter saves; every key except Escape stops propagating so the
enclosing menu's typeahead never steals keystrokes. Caret insertion from the
reference list goes through the editor's imperative `editorRef` handle. Syntax
highlighting is **not** a second grammar:
[`highlight.ts`](../../src/lib/formula/highlight.ts) (pure, React-free) classifies
spans by running the real tokenizer plus the parser's own lookahead rules (scope
roots, `prop("…")`, call syntax, word operators; comments recovered from inter-token
gaps), so editor colors can't drift from what the parser accepts, and
unparseable-mid-keystroke drafts still highlight.

**Fused autocomplete** (proposal §6.2): one completion source merges properties
(labeled/filtered by field name, applied as the canonical `prop("<id>")` text — one
atomic chip — with the field-type icon and value type as detail; a typed
`thisPage.`-prefix narrows to properties and is replaced whole), catalog functions
(signature as detail, description as the info card, caret placed inside the inserted
parens — after them for zero-argument functions), and the word operators/keywords
(`and`/`or`/`not`/`true`/`false`). When databases are wired, a `db` entry
completes like a scope root — accepting inserts the opener `db("` and reopens
the popup — and **database-name completions** fill the `db("` argument
position: labeled/filtered by name (a spaces-tolerant `validFor`, not the
identifier rule), applied as the whole canonical `db("<id>")` reference (one
atomic chip, opener and any partial argument consumed, extent re-resolved
from live state) with the caret after the closing paren. The db-argument
position sits inside a string literal, which normally suppresses completions
— it is the one deliberate carve-out, checked before the string/comment gate.
It opens on typed identifiers or explicit Ctrl+Space; Enter/Tab accept. Ranking is **type-aware**: `formulaEnclosingCallAt`
(token-level, works mid-keystroke) finds the innermost unclosed call and argument
index, the catalog's typed params give the expected type, and candidates whose
result type fits (`formulaTypeFits` — the checker's own acceptance relation) are
boosted above CM's fuzzy-match score, with properties leading ties. The popup is
theme-styled via CSS variables and parents to `document.body` so the enclosing menu
popup can't clip it; while it's open, Escape closes only the popup (its bubble is
consumed so the menu stays open), and bubbles to close the menu otherwise.
Diagnostics render in-editor as destructive wavy underlines (a diagnostic touching an
atomic chip rings the whole chip instead), and an argument info card anchors at the
callee while the caret sits in a call's argument list.

**Chip option menu** (proposal §7, "chip tap = menu, not caret gymnastics"): when the
panel wires `onChipTap`, presses on a chip are intercepted (caret placement *around*
chips and whole-chip backspace are untouched) and reported with the chip's DOM node
plus its canonical span resolved from the current doc at tap time — never stale
build-time offsets — and a `kind` (`"property" | "database"`) with the
referenced id (`refId`). The panel opens
[`formula-chip-menu.tsx`](../../src/components/database/formula-chip-menu.tsx)
anchored at the chip: **Change property** (a property list with field-type icons)
splices `canonicalPropertyReference(id)` over the span via the editor handle's
`replaceRange`, and **Remove** deletes the whole span. Database chips get the
same menu with **Change database** instead — the workspace databases behind
the database glyph, the current one check-marked, a pick splicing
`canonicalDatabaseReference(id)` over the span (the change row drops out
entirely when there is nothing to swap to, leaving Remove). It's a ui Popover with plain
buttons — not a DropdownMenu, because the stack layout lives inside a Base UI menu
popup where nested menus are illegal (the rollup wizard's constraint) — and on coarse
pointers it renders as a vaul bottom drawer (`variant="menu"`) automatically, matching
the accessory row's picker drawers. Escape/outside-click dismissal refocuses the
editor.

**Argument placeholder tokens** (proposal §7, the Numbers trick): inserting a
function with parameters — from the fused autocomplete, the reference list, or
the mobile function picker (both via the editor handle's `insertSnippet`) —
lands the snippet form `dateAdd(date, amount, unit)`. The doc text IS the
parameter labels (`formulaParamLabel`, so optional params read `digits?` and a
variadic tail `…`) — plain text the parser sees directly, so diagnostics flag
unfilled placeholders and Save stays gated until they're replaced. A state
field tracks each label's span (mapped through every edit) and styles it as a
muted dashed pill via `Decoration.mark` — never `Decoration.replace`, nothing
is hidden, so nothing placeholder-ish *can* persist into a saved expression.
The first placeholder is **selected** on insert so typing replaces it;
Tab/Shift-Tab select the next/previous placeholder (Tab still accepts an open
completion first, and falls through once no placeholder remains ahead);
pressing a pill selects its whole range — the touch affordance that makes
argument filling tap-and-type instead of caret gymnastics. A placeholder
leaves the set the moment its text stops matching its label (typing over the
selection), and Mod+Enter sweeps the set before submitting. Zero-parameter
functions keep the plain `name()` insert with the caret after the parens; the
textarea path keeps the caret-inside-parens `name()` insert (placeholders are
a CM6 affordance). Type-driven picker sheets for closed-type placeholders
(unit enums, select options) are deferred.

### Mobile sheet

On coarse pointers the "Edit property" submenu drawer hosts the panel's
`layout="sheet"` form (proposal §7): an explicit **Cancel / "Formula" / Done**
header (Done is the sheet's only save affordance, gated exactly like Save), the
**CM6 editor even on coarse pointers** (its native touch caret/IME handling is the
point — the plain textarea remains only as the Suspense fallback), a compact
tappable **status pill** ("✓ number" / "1 issue") that toggles the full
first-diagnostic message beneath it, and the live preview line. There is no inline
search/reference list/detail strip — insertion moves to
[`formula-editor-accessory-row.tsx`](../../src/components/database/formula-editor-accessory-row.tsx),
a keyboard accessory row pinned above the on-screen keyboard via
`useKeyboardToolbarAnchor` (portaled to `document.body`, composited-transform
tracking on iOS — the same machinery as the canvas `MobileEditorToolbar`): a
property button and a function button open bottom **picker drawers** (vaul
`variant="menu"`, `modal={false}` + `onCloseAutoFocus` preventDefault so the editor
reclaims the keyboard after an insert; each has its own search), followed by the
operator keys `( ) , " + - * / . ==`. All insertions go through the panel's caret
splice / `insertPropertyReference` paths (canonical `prop("<id>")` chips on CM6),
taps fire selection haptics, and the row hides while a picker drawer is open. The
Rollup button stays reachable below the editor and swaps in the wizard as in the
other layouts.

### Rollup wizard

Rollups are ordinary formulas — one engine, one mental model; the sugar teaches the
language. The **Rollup** button (shown only when a relation field with a resolvable
target exists) swaps the reference list for a three-step wizard
([`formula-rollup-wizard.tsx`](../../src/components/database/formula-rollup-wizard.tsx)):
pick a relation, a target property (or "All rows"), and an aggregation, and the
generated canonical expression lands in the active surface (CM6 takes canonical text
directly and chips it; the textarea takes the humanized display form; an
empty/whitespace draft is replaced outright). The generator
([`rollup-template.ts`](../../src/lib/formula/rollup-template.ts)) offers aggregations
by the member's type kind — number → sum/average/min/max, date → earliest/latest
(blank-safe: `latest` filters empties before sorting), checkbox → count checked,
anything → count non-empty / show all, no member → count rows — and every emitted
expression is guaranteed to parse: member names that aren't identifier-safe (checked
by running the real tokenizer, plus the keyword/reserved list) emit the bracket form
with escaped quotes. It lives inside the Base UI menu popup, so it's plain buttons
only — no nested menus.

## Templates

[`template.ts`](../../src/lib/formula/template.ts) powers `{{ thisPage.X }}` tokens in
row-page templates ([`row-template.ts`](../../src/lib/databases/row-template.ts)):
`splitTemplateText` finds `{{ … }}` spans string-literal-aware (a quoted `"}}"` inside
an expression doesn't close the token; an unterminated `{{` is literal text), and
`evaluateTemplateText` parses/evaluates each span as a full v2 formula, rendering
errors inline as "⚠ message". Never throws.

## Contracts

- **Never throw** — tokenize/parse return Results, check returns diagnostics,
  evaluation returns error values; hostile input (synced cell text, pathological
  nesting) degrades to inline errors, never a render crash.
- **Purity** — everything under `src/lib/formula/` is React-free and side-effect-free;
  the clock is injected via scope, so tests and SSR paths are deterministic.
- **v1 compatibility** — the frozen golden corpus
  ([`corpus.fixture.ts`](../../src/lib/formula/corpus.fixture.ts)) pins v1 display
  output for every retired-catalog example, with deliberate divergences documented in
  the test's `DIVERGENCES` map.

## Deferred

`db()` entries in the panel's inline reference list (the chips, fused
autocomplete, and chip menu shipped — see [Editor panel](#editor-panel)),
member canonicalization, member
autocomplete after `r.`, save-time cross-database cycle rejection, and
type-driven picker sheets for closed-type argument placeholders (a `unit` enum
or select option opening a picker instead of the keyboard) are planned later
phases — see the [proposal](../proposals/formula-language-v2.md) §4.4–§7. The
`db()` language + engine core itself shipped (see
[Whole-database references](#whole-database-references-db)).
