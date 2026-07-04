# Proposal: formula language v2 — a powerful, typed, chip-first expression language

> Status: **proposal / research** — nothing in this document is implemented yet.
> Companion reading: [notion-style-databases](./notion-style-databases.md) (§3.3 computed
> fields, §5.3 inline query language), plus `src/lib/expr/` (the shipped v1 engine).

This proposes a second-generation formula language for the shared expression engine
(`lib/expr/`) — the one behind database formula fields and `{{ … }}` inline tokens. v1 is a
clean, never-throws, single-row scalar language. v2 keeps that foundation and adds the three
things that make it genuinely powerful: a **surfaced type system**, **language ergonomics**
(`let` bindings, method chaining, `switch`), and a **list/aggregate dimension** (`count()`
and friends over relations and multi-value fields) — all fronted by a **chip-first editor**
that never zooms on mobile and binds references to stable ids instead of fragile names.

It is grounded in an audit of the v1 engine and the data models of Notion Formulas 2.0,
Coda, Microsoft Power Fx, Excel/Sheets (`LET`/`LAMBDA`/`SWITCH`), and jq-style format pipes.

---

## 1. Where v1 stands, and what it can't do yet

The v1 engine (`src/lib/expr/`) is small and correct:

- **Pipeline.** `tokenize.ts` → `parse.ts` (recursive descent, conventional precedence) →
  `evaluate.ts` (tree-walking, **never throws** — every failure is a distinguished
  `ExprError` value that propagates through operators and arguments).
- **Grammar.** Number/string/boolean/null literals; property refs (`thisPage.X`,
  `thisRow.X`, bracket form `thisPage["Unit Price"]`); unary `-`/`not`; binary
  arithmetic/comparison/logic; function calls. `if`/`and`/`or` short-circuit.
- **~24 functions** (`function-catalog.ts` is the single source of truth the builder renders;
  `function-catalog.test.ts` asserts it never drifts from `evaluate.ts`).
- **One row of scope.** `createRowScope` (`row-scope.ts`) resolves references against exactly
  one row's cells by field name (case-insensitive). Formula fields **cannot reference other
  formulas** yet ("Formulas cannot reference other formulas yet").

The three structural gaps:

1. **No list/rowset type.** `multiSelect` collapses to a comma-joined string; there is no way
   to hold, filter, or aggregate a collection. This is why `count()` doesn't exist — there is
   nothing to count.
2. **No ergonomics for non-trivial formulas.** Any value used twice is typed twice; nested
   conditionals are nested `if`s; there are no local bindings.
3. **The editor is a raw 12px textarea.** References are fragile bracket-escaped text
   (`formulaPropertyReference()` in `function-catalog.ts:302` exists *because* names break),
   there is no inline autocomplete, and the font size force-zooms iOS on focus.

---

## 2. Languages we model on

| Language | What we take | What we leave |
|---|---|---|
| **Notion Formulas 2.0** | The target user's exact mental model: typed values, `let`/`lets`, **method chaining** (`.map`/`.filter`/`.format`), a first-class **list** type. Our closest peer — users expect parity. | Overloading `.` for both property access and method calls without disambiguation. |
| **Coda** | `thisRow`, and formulas that return **references** (a row / rowset), not only scalars. | Whole-table programming scope. |
| **Microsoft Power Fx** | The **design philosophy**: declarative, **expression-only (no statements)**, strongly typed, spreadsheet-like. This is already our architecture — v2 formalizes it. | — |
| **Excel / Google Sheets** | The universal function vocabulary (`SUM`, `COUNTIF`, `IFS`, `SWITCH`, `TEXT`). `LET`/`LAMBDA` validate bindings + higher-order functions. | 1-indexed addressing, spill semantics. |
| **jq / F# / Elm `\|>`** | **Format pipes** (`\| currency \| compact`) — already specified for inline tokens in databases §5.3; v2 unifies them into formula fields too. | Turing-complete piping. |
| **Grist** | The dependency-DAG + materialization model (databases §3.3) for formula→formula references. | Python-as-formula. |

**Direction: Notion 2.0's _surface_, Power Fx's _philosophy_, Excel's _vocabulary_, jq's
_pipes_.** Commit to four language capabilities (§3) and the function catalog (§4) and the
`count()` family (§5) fall out naturally.

---

## 3. Language core upgrades

Ordered by leverage. Each is designed to preserve the never-throws contract and to be an
additive change to the existing parser/evaluator, not a rewrite.

### 3.1 A surfaced type system

v1 already reasons about number/string/boolean/null/date informally inside the evaluator.
v2 promotes this to a checked, **user-visible** type computed at parse time:

```
number | text | boolean | date | list<T> | row | empty
```

A pure `inferType(ast, fieldTypes)` pass over the AST (no evaluation) yields the result type
and the first type error with a source position — reusing v1's positioned-error convention.
Types power everything downstream: autocomplete offers only valid continuations, method
chaining knows what methods a value has, and the editor can show a result-type badge.

This is additive: the evaluator's runtime type coercion stays exactly as-is (the type checker
is advisory + editor-facing; a formula that skips it still evaluates safely).

### 3.2 `let` / `lets` bindings

The single biggest readability win, straight from Notion 2.0 and Excel `LET`:

```
let(days, dateDiff(thisPage.Due, today(), "days"),
  if(days < 0, "Overdue", concat(days, " days left")))
```

Implemented as a scoped-binding AST node: `let(name, value, body)` and the varardic
`lets(n1, v1, n2, v2, …, body)`. The evaluator pushes bindings onto the scope chain; the
scope lookup in `row-scope.ts` gains a binding frame checked before field resolution. Bindings
are lazy-or-eager by design decision (eager is simpler and matches Notion).

### 3.3 Method chaining (pure parser sugar)

`x.f(a, b)` desugars to `f(x, a, b)` at parse time — **zero evaluator changes**. This makes

```
thisPage.Tags.filter(current != "Done").map(upper(current)).join(", ")
```

read the way post-Notion users think, while every "method" remains an ordinary catalog
function. `current` (Notion's convention) is the implicit element binding inside `map`/
`filter`/`find`/`some`/`every` lambdas — a scoped binding (§3.2 machinery) set per element.

Note the disambiguation rule we take from the Notion critique: `thisPage.Name` (a scope root
followed by a bare identifier) stays **property access**; `<expr>.name(` (any expression
followed by `.name` + `(`) is a **method call**. The parser already special-cases
`thisPage`/`thisRow` roots (`SCOPE_ROOTS` in `parse.ts:96`), so the fork is localized.

### 3.4 A `list` type + higher-order operations

The gateway to power. A `list<T>` value flows through the evaluator like any scalar; it comes
from three sources: `multiSelect` fields (today collapsed to a string — v2 keeps them as
`list<text>`), literals `[a, b, c]`, and relations/rollups (§5). Core ops:

`map`, `filter`, `find`, `some`, `every`, `sort`, `sortBy`, `unique`, `slice`, `first`,
`last`, `at`, `length`, `join`, `includes`, `flat`, `reverse`.

Higher-order ops (`map`/`filter`/…) use the `current` element binding from §3.3.

### 3.5 `switch` / `ifs` — flatten nested conditionals

```
switch(thisPage.Priority, "P0", "🔴", "P1", "🟠", "P2", "🟡", "⚪️")   // last arg = default
ifs(thisPage.Score >= 90, "A", thisPage.Score >= 80, "B", true, "C")
```

Both are lazy like `if` (only the matched branch evaluates), added beside `evalIf` in
`evaluate.ts` — not in the `EXPR_FUNCTIONS` table, because their arguments must not be
eagerly evaluated.

### 3.6 Formatting & conversion — one unified format (functions, not pipes)

A pipe operator (`value | currency`) was prototyped and **removed**: a second syntax for what
functions already do was confusing, and it fought the "one way to do things" goal. Formatting
and type conversion are ordinary functions, so there is a single mental model — everything is
`fn(value, …)`:

```
currency(thisPage.Revenue)        → "$1,200,000.00"
compact(thisPage.Revenue)         → "1.2M"
formatDate(thisPage.Due, "MMM d") → "Mar 5"
fromNow(thisPage.Due)             → "3 days ago"
toDate(thisPage.Timestamp)        → "2026-03-05"   (convert)
toNumber(thisPage.Code)           → 42             (convert)
```

Format functions (`currency`, `percent`, `compact`, `formatNumber`, `fromNow`/`timeAgo`) return
display text; conversion functions (`toText`, `toNumber`, `toDate`, `toBoolean`) change a
value's type so math on dates/numbers is easy. `fromNow`/`timeAgo` read the clock and are
`isVolatile`. No new operator, no display-layer pass — they are entries in `EXPR_FUNCTIONS`
like every other function.

---

## 4. The function catalog: what's missing

v1 ships ~24 functions. v2's target catalog, grouped as the builder groups them. **Bold =
high demand.** Where a name already exists in the Calculate-row aggregate taxonomy
(`databaseAggregateFnSchema` in `schemas/database.ts`), v2 reuses that spelling for
consistency.

- **Logic** (have: `if`, `empty`): **`ifs`**, **`switch`**, `coalesce`/`default`,
  `and(…)`/`or(…)` varargs, `xor`, `isEmpty`/`isNotEmpty`, `isNumber`/`isText`/`isDate`
  type guards.
- **Text** (have: `concat`, `len`, `lower`, `upper`, `trim`, `contains`, `replace`,
  `format`): **`substring`/`slice`**, **`split`**, **`startsWith`/`endsWith`**, `indexOf`,
  `padStart`/`padEnd`, `repeat`, `capitalize`/`titleCase`, `regexMatch`/`regexReplace`/
  `regexExtract`.
- **Math** (have: `round`, `floor`, `ceil`, `abs`, `min`, `max`, `sum`, `average`): **`mod`**,
  **`pow`/`sqrt`**, `clamp`, `sign`, `log`/`log10`/`exp`, `roundUp`/`roundDown`/
  `roundToMultiple`, `toNumber`.
- **Date/time** (have: `formatDate`, `dateAdd`, `dateDiff`, `today`, `now`): **`year`/`month`/
  `day`/`hour`/`minute`**, **`weekday`/`dayName`/`monthName`**, `startOf`/`endOf("month")`,
  `parseDate`, `formatDuration` ("2d 4h"), `isSameDay`, `age`.
- **List/aggregate** (§3.4 + §5): **`count`**, **`countIf`**, `sum`/`average`/`min`/`max`
  **over a list**, `median`, `countUnique`, `countEmpty`, `percentIf`, plus the §3.4 core
  ops.
- **Display pipes** (§3.6): `currency`, `percent`, `compact`, `plain`, `ago`/`fromNow`,
  `date(pattern)`, `number(decimals)`.

Roughly ~50 additions. The pure ones (logic/text/math/date-parts) are each a one-line entry
in the `EXPR_FUNCTIONS` table plus a catalog entry — the drift test enforces both exist. They
carry no new data-model dependency and can land first.

---

## 5. `count()` and the aggregate/relation story

**`count()` is not a missing function — it is a missing dimension.** Counting implies counting
*something*: related rows, a filtered subset, or a list. It arrives with the `list` type
(§3.4) and, for the headline use case, with **relations** (databases Phase 2 / §3.3).

Two tiers:

1. **List aggregates (needs only §3.4).** `count(thisPage.Tags)`, `countIf(thisPage.Scores,
   current > 80)`, `sum`/`average`/`min`/`max`/`median` over any `list`. Works today on
   `multiSelect` fields the moment they carry a real list type.
2. **Relation-backed aggregates (needs Phase 2 relations + Phase 6 DAG).** The Notion payoff:
   ```
   count(thisPage.Tasks)                                  // rows in a relation
   countIf(thisPage.Tasks, current.Status == "Done")      // filtered
   sum(thisPage.LineItems, current.Qty * current.Price)   // rollup-in-a-formula
   ```
   A relation field resolves to a `list<row>`; `current` is the related row inside the lambda.
   This is precisely the rollup semantics databases §3.3 already commits to maintaining via
   live queries / the dependency DAG — so formula aggregates and rollup fields **share one
   implementation**, they are two front-ends on the same engine.

Volatility and cycle rules are inherited unchanged from v1: aggregates over `now()`/`today()`
stay volatile (`isVolatileExpression`), and formula→formula references wait for the Phase 6
dependency DAG that replaces the current "cannot reference other formulas" guard.

---

## 6. The editor: chips, autocomplete, no-zoom mobile

`formula-editor-panel.tsx` today is a raw textarea + a tappable reference list. Three moves.

### 6.1 Mobile: never zoom on focus (ship immediately)

`formula-editor-panel.tsx:251` sets the expression textarea to `text-xs md:text-xs` — 12px on
**every** breakpoint. iOS Safari force-zooms any focused input under 16px. Fix:
`text-base md:text-xs` (16px mobile, 12px desktop). The same audit applies to the reference
search `InputGroup` (`h-8` + default input size) and any cell editor a formula opens over.
One line, no dependencies, independent of the rest of this proposal.

### 6.2 Chips bound to stable ids

Render property references and function tokens as **design-system chips** (field icon +
name, tinted by the field's `blockColorSchema`) — reusing the exact renderer databases §5.3
defines for inline tokens ("focused row shows raw source, unfocused renders chips"). A chip
carries `fieldId`, not a name, so renaming a field rewrites every chip's label with **zero
broken formulas** — retiring the bracket-escaping `formulaPropertyReference()` hack. Clicking
a chip opens a popover with the underlying reference and an "open field" action.

The `EditableSurface` hybrid stays: keep the plain textarea for **editing** (focused = raw
source with subtle syntax highlight), render chips only in **unfocused / preview / read**
states. No contenteditable migration — the same call databases §5.3 already makes.

### 6.3 Inline, type-aware autocomplete

Typing `thisPage.` or a function name opens a slash-menu-style popover **at the caret** (the
pattern already exists in the editor), filtered by the §3.1 type checker so it offers only
valid continuations (a `date` value suggests `year`/`weekday`/`| ago`, not `upper`). The
current "tap a row to insert at caret" list stays as the browsable reference, but autocomplete
becomes the primary path — matching the databases §5.3 `{{`-autocomplete UX.

---

## 7. Phased plan

Each phase is independently mergeable and ships user-visible value.

| Phase | Status | Scope | Key deliverables |
|---|---|---|---|
| **A — Quick wins** | ✅ shipped | Bigger catalog, no-zoom editor | Mobile font fix (§6.1); the pure functions (logic/text/math/date-parts, §4) as `EXPR_FUNCTIONS` + catalog entries, drift test green |
| **B — Ergonomics** | ✅ shipped | Nicer single-row formulas | `let`/`lets` (§3.2), method-chaining sugar (§3.3), `switch`/`ifs` (§3.5) — parser-side, evaluator mostly untouched |
| **C — Types + editor** | ◑ partial | Typed, guided authoring | `inferType` pass (§3.1) ✅; formatting/conversion as unified functions (§3.6, pipes removed) ✅; result-type badge ✅; single searchable autocomplete with inline titles + descriptions, no detail strip, fills the drawer on mobile ✅. Still open: chips bound to field ids (§6.2) and at-caret typeahead (§6.3) |
| **D — Lists** | ✅ shipped | `count()` tier 1 | `list` type + higher-order ops (§3.4); list aggregates over `multiSelect`/literals (§5 tier 1) |
| **E — Relations** | ⛔ blocked | `count()` tier 2 (the payoff) | relation-backed `list<row>` + aggregates, sharing the Phase 6 rollup engine (§5 tier 2) |

Dependencies: A stands alone. B needs only v1. C needs B (chaining) for autocomplete to be
worth it. D needs the list type from C's checker.

**Phase E is blocked on prerequisites outside the formula language.** It needs (1) a
`relation` field type in `schemas/database.ts` (`databaseFieldTypeSchema` has none today) that
resolves to a `list<row>`, and (2) member access on a row value (`current.Status`) — the
parser's postfix handles `.name(args)` method calls but not bare `.field` on an arbitrary
expression. Both arrive with databases Phase 2 (relations) + Phase 6 (rollup DAG). The list
machinery from Phase D (`count`/`countIf`/`map`/`filter`) is already the execution layer those
aggregates will reuse — so E becomes "resolve a relation to a `list<row>` and add row-member
access," not new aggregate logic.

---

## 8. Risks & open questions

- **Never-throws contract.** Every v2 addition must preserve it — `let` scope frames, list
  ops, and pipes all return `ExprError` values, never throw. The existing `evaluate.ts` tests
  are the guardrail; each new function needs the same error-as-value coverage.
- **Method-chaining ambiguity.** The `thisPage.Name` (property) vs `expr.method(` (call) fork
  (§3.3) must be unambiguous in the grammar and covered by parser tests, or renamed-field
  chips and dotted refs collide.
- **Type checker vs runtime coercion drift.** `inferType` (§3.1) is advisory; if it disagrees
  with the evaluator's actual coercion the editor lies. Single source of truth: derive both
  from one coercion table, or test them against each other the way `function-catalog.test.ts`
  pins catalog↔evaluator today.
- **Pipe vocabulary must match databases §5.3 exactly.** If formula-field pipes and inline-
  token pipes diverge, the "one mental model" promise breaks. Define the pipe set in one
  shared module consumed by both.
- **Open question — `list` display in table cells.** A formula returning `list<text>` needs a
  cell renderer (chips? comma-join?). Likely reuse the `multiSelect` cell renderer.
- **Open question — how far to push higher-order syntax.** `current` (Notion) vs an explicit
  lambda param vs both. Recommend `current` first (matches the peer), explicit params later
  only if demanded.
