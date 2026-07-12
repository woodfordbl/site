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
  `member` node; whether it exists is the checker's concern.
- **`let(name, value, body)` / `lets(…)`** — named intermediates. Evaluator special
  forms (they bind names from raw AST nodes), not catalog entries; same for `prop`,
  which is syntax parsing straight to a property node.
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
  loss; unparseable input passes through unchanged.
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

`computeFormulaRowValues` runs the same plan for ONE row (row-page properties panel,
editor preview). `formulaFieldTypes` / `formulaCheckContext` type formula fields in
the same topological order, so a formula referencing another formula checks against
its dependency's real result type. `hasVolatileFormula` flags clock-dependent schemas;
the table view re-evaluates the overlay on a 60-second tick (paused while the tab is
hidden). `formulaDisplayInfo` supplies the parse-error badge on column headers.

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
are **non-reactive** (accepted v1 limitation): edits to a target database don’t
retrigger the referring database’s overlay until its own inputs change; the P3.3
engine adds subscriptions. Cross-database formula cycles are guarded at evaluation
time by a visiting set keyed by (databaseId, fieldId, rowId) — re-entry returns a
named error (`Circular reference: Tasks.Calc → Projects.Rollup → Tasks.Calc`);
same-database formula-on-formula still flows through the overlay’s topological plan.

**Display**: a row ref renders as its target row’s primary-field text ("Untitled"
fallback — the relation chip rule) via `formulaValueToDisplay(value, { rowLabel })` /
`formulaRowLabelOf(relations)`; lists of rows comma-join like any list, and
`formulaValueToCellValue` projects rows/row lists to those titles for the merged-row
pipeline. The type badge reads "row" / "list of rows".

## Editor panel

[`formula-editor-panel.tsx`](../../src/components/database/formula-editor-panel.tsx)
(the column menu's Edit-property builder): the draft state is the **canonical**
expression (`prop("<id>")` — exactly what gets stored), so parse/check/preview/save
operate on it directly; Save runs one final idempotent `canonicalizeExpression` to
catch typed name refs the editor hasn't converted yet. The plain textarea (coarse
pointers, and the fallback on fine ones) displays `humanizeExpression(draft)` and
re-canonicalizes on every change — humanize∘canonicalize is display-stable, so
textarea users still only ever see names. Status line shows the first parse error or
checker diagnostic or "✓ Valid" plus the result-type badge; positions are 1-based
characters into what the user SEES — `formulaDisplayOffset`
([`highlight.ts`](../../src/lib/formula/highlight.ts)) maps canonical offsets past
each `prop("<id>")` span's display length (the chip's field-name label in the CM6
editor, the humanized reference in the textarea). A live preview evaluates the draft against
the first row through the same scope the overlay uses (other formulas resolve to
their computed values). Save is blocked only by parse errors — checker diagnostics
warn but save, since the overlay degrades per-cell. The searchable Properties /
Functions / Operators reference inserts at the caret, docs sourced from the catalog.

On fine pointers the expression input is
[`formula-code-editor.tsx`](../../src/components/database/formula-code-editor.tsx),
a CodeMirror 6 editor **lazy-loaded** at the panel boundary (`React.lazy`, plain
textarea as the Suspense fallback) so CM6 stays out of the main bundle; coarse
pointers keep the textarea until the mobile editor phase. The CM6 doc is the
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
conversion never fights the caret mid-word. Soft-wrapped, autogrowing, no line
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
(`and`/`or`/`not`/`true`/`false`). It opens on typed identifiers or explicit
Ctrl+Space; Enter/Tab accept. Ranking is **type-aware**: `formulaEnclosingCallAt`
(token-level, works mid-keystroke) finds the innermost unclosed call and argument
index, the catalog's typed params give the expected type, and candidates whose
result type fits (`formulaTypeFits` — the checker's own acceptance relation) are
boosted above CM's fuzzy-match score, with properties leading ties. The popup is
theme-styled via CSS variables and parents to `document.body` so the enclosing menu
popup can't clip it; while it's open, Escape closes only the popup (its bubble is
consumed so the menu stays open), and bubbles to close the menu otherwise. The chip
option menu and diagnostics-in-editor (squiggles) are later stages (proposal §6).

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

`db()` whole-database references, the incremental dependency-graph engine (reverse
index, dirty tracking, reactive cross-database reads, member canonicalization,
member autocomplete after `r.`), and save-time cross-database cycle rejection are
planned later phases — see the [proposal](../proposals/formula-language-v2.md)
§4.4–§7.
