# Formula Language v3 — a more natural language, richer types, engine economics, and a Numbers-class mobile editor

Status: proposal (August 2026). A critical re-examination of the shipped v2
system ([formula-language-v2](./formula-language-v2.md), architecture in
[formula-language.md](../architecture/formula-language.md)) across four axes:
language naturalness, the type/property surface, the calculation engine's
implementation economics, and the mobile editing experience. Items marked
**[shipped]** landed with this proposal's first PR; everything else is ranked
roadmap.

## 1. Where v2 landed — and where it strains

v2 delivered the hard architecture: id-canonical references, a typed
bidirectional checker, relations as `list<row>`, `db()` whole-database reads,
an incremental column-graph engine with row-level dirty sets, user-defined
functions, and a CM6 chip editor with a mobile sheet. The strain points are
not architectural — they are *economic* and *ergonomic*:

- The language still reads like a programming language in places where a
  spreadsheet-native audience expects prose (`&` was a hard lex error that
  hinted at boolean AND; `==` shipped on the mobile operator row but `!=` and
  every inequality did not).
- One boolean parser flag (`thisRowInScope`) threaded through ~60 code sites
  across parser, checker, highlighter, rewriters, and editor — for zero
  semantic difference.
- The engine treated *any* database-record write as a schema change: a column
  drag-resize triggered a full graph rebuild (O(D²) type-checks across
  databases) plus a 100k-cell recompute per gesture at 10k×10 scale.
- The runtime value of a cell could contradict its static type: an unset
  checkbox typed `boolean` but evaluated blank, so `if(thisPage.Done, …)`
  errored on every never-toggled row.
- A single bad row poisoned a formula with no recovery — `??` catches blank,
  never errors, and no `ifError` existed.

## 2. The language: operation symbols and naturalness

### 2.1 Operator inventory (post-v3)

| Tier (loosest → tightest) | Operators | Notes |
|---|---|---|
| coalesce | `??` | blank fallback, never catches errors (that's `ifError`) |
| or | `or`, `\|\|` | word form is the documented spelling |
| and | `and`, `&&` | |
| equality | `==`, `!=`, `<>` **[shipped]** | `<>` normalizes to `!=` at parse time — the spreadsheet spelling costs one tokenizer row |
| comparison | `<` `<=` `>` `>=` | |
| concat | `&` **[shipped]** | spreadsheet text join: coerces numbers/booleans/dates, blank reads as `""`; lists/rows error |
| additive | `+` `-` | `+` stays number-add / text-concat; blank operands still error (use `&`) |
| multiplicative | `*` `/` `%` | |
| unary | `-`, `not`, `!` | |
| power | `^` | `**` now gets a targeted hint **[shipped]** |
| postfix | `.name`, `.fn(…)`, `["name"]` | |

The `&` decision is the load-bearing one: before v3, a user typing
`Name & " — " & Status` (the single most common thing an Excel/Sheets refugee
tries) got `Unexpected "&" — use "&&" or "and"` — a hint that redirects string
concatenation to boolean logic, the worst possible answer. `&` had zero
occurrences in the frozen v1 corpus, so making it a real operator was a pure
grammar extension with no compat risk.

### 2.2 Fixed inconsistencies [shipped]

- **Lambda-parameter reserved names.** `db => 1` parsed but `db => db` failed
  with `Expected "(" to open the "db(…)" reference` — a binding that could
  never be read. `let` statements and user-function parameters already
  rejected the reference roots; lambda parameters now apply the same rule
  (`prop`/`db`/`thisPage`/`thisRow` are uniformly un-bindable).
- **`**` hint.** Previously lexed as two `*` tokens and failed downstream
  with `Unexpected "*"`; now a tokenizer-level hint names `^`.

### 2.3 Naturalness roadmap (not shipped — ranked)

1. **`in` membership operator** — `x in [a, b, c]` / `Status in Rel` sugar for
   `includes`. Grammar-free of corpus hazards, but **blocked on a
   reserved-word migration story** (below).
2. **Infix `contains`** — `Name contains "draft"`. Must use the
   infix-position-only keyword trick `and` already uses, because `contains`
   is a live catalog function pinned by the corpus.
3. **Percent literals** — `price * 10%`. Requires resolving the collision
   with binary `%` (restrict to `<number-literal>%` followed by a
   non-operand). Worth doing; demote `%`-modulo in docs in favor of `mod()`
   first.
4. **Unit literals / durations** — `due + 3 days`. Needs a `duration` value
   kind (§3.3); the payoff is retiring the `dateAdd(d, 3, "days")`
   incantation for the common case. `date + number` stays rejected — "7
   what?" is a real ambiguity, and unit literals answer it properly.
5. **`if x then a else b`** — rejected. Reserving `then`/`else` breaks any
   field or binding with those names; the call form plus the editor's
   placeholder snippets is good enough.

**Prerequisite: reserved-word migration.** Stored `let` bindings, lambda
params, and user-function names/params are validated only at write time.
Adding any keyword operator retroactively invalidates stored expressions with
no version field and no migration hook. Before shipping item 1 or 2: a startup
scan (mirroring `formula-ref-migration.ts`) that detects bindings colliding
with a new reserved set and either auto-renames or surfaces them. This is the
single hidden blocker for the whole naturalness program.

### 2.4 Diagnostics debt worth paying

- `//` line comments can silently swallow `total // count` (integer-division
  muscle memory) — the rest of the line vanishes with no diagnostic. A checker
  warning for a comment that directly follows a complete expression on the
  same line would catch it.
- The `not()` catalog entry is unreachable by its own name (prefix `not`
  matches first); only `x.not()` reaches it. Either delete the entry or stop
  offering it as a call in docs.
- `null` is the one keyword users can type for the concept every message
  calls "blank"/"empty". Consider a `blank` literal alias with `null` kept
  hidden.

## 3. thisPage vs thisRow — decision record [shipped]

**Verdict: one scope, two accepted spellings, zero conditional machinery.**

`thisRow` was already a pure synonym of `thisPage` on database-row hosts —
identical AST, identical resolution. The only thing the `thisRowInScope` flag
bought was a *different error message* on ordinary pages (`Unknown name
"thisRow"` instead of a property-resolution error), at the cost of:

- `ParseFormulaOptions` existing solely to carry the flag, threaded through
  `parseFormula`, `checkFormula`'s context, `highlightFormula`,
  both ref-rewriters, and every editor call site;
- three independent re-implementations of the scope-root lookahead (parser,
  highlighter, and a regex in the CM6 editor that didn't handle the bracket
  form);
- a CM6 ViewPlugin rebuild path that existed only to restyle `thisRow` when
  the flag flipped;
- asymmetric binder rules (`let thisRow = 1` legal on one host, illegal on
  another — a distinction no user could perceive as intentional).

v3 makes `thisRow` an unconditional synonym everywhere and deletes the flag
and all of its threading. Direction of travel is still **thisPage-only**: the
system never *writes* `thisRow` (`humanizeExpression` always emits
`thisPage`), autocomplete now offers only `thisPage` on every host, and docs
teach one spelling. `thisRow` remains accepted input indefinitely — stored
formulas and muscle memory cost nothing to keep, and dropping the parse-time
acceptance would buy nothing back.

Behavior changes: ordinary pages now resolve `thisRow.Title` against the base
page fields (strictly better than erroring), and a bare `thisRow` is the same
"expected `.` or `[`" parse error `thisPage` gives.

## 4. Types and properties

### 4.1 Static-type honesty [shipped]

Two projection rules contradicted the checker and are fixed:

- **Unset checkbox → `false`** (was blank). The checker types checkboxes
  `boolean`; every never-toggled row made `if(thisPage.Done, …)` a runtime
  error.
- **Unset multiSelect → `[]`** (was blank), the rule relations already
  followed — `length()`/`includes()` no longer trip over blank.

### 4.2 Error recovery and conversion [shipped]

- `ifError(value, fallback)` / `isError(value)` — lazy catalog forms (an
  eager signature would propagate the error before the implementation saw
  it). This closes the largest usability hole in the language: one bad row no
  longer poisons a column with no recovery.
- `toNumber(value)` — text→number with blank (not error) for unparseable
  text; booleans read 1/0. Unblocks arithmetic over text/select data.
  (`format(value)` already covers the toText direction.)
- `dateAdd`/`dateDiff` gain `"weeks"`.

### 4.3 Roadmap, ranked by value-per-cost

Adding a *new value kind* touches a fixed ~13-site checklist (type lattice +
name tables, runtime value + equality + display, `typeFits`, projection), so
the ranking splits on whether a feature needs one.

**No new kind (cheap, do next):**

1. **Text function fill-in** — `substring`/`left`/`right`/`indexOf`/
   `padStart`/`repeat`, plus regex `test`/`match`/`replaceRegex` (safe
   dialect + compiled-pattern cache). The catalog's `replace` is literal-only
   and `contains` is case-sensitive-only today.
2. **Row metadata properties** — `row:createdAt` / `row:updatedAt` /
   `row:id` / `row:icon` pseudo-fields via the proven `page:` prefix
   convention. The schema stores all of them on every row; "created this
   week" is currently inexpressible. Same plumbing gives `r.createdAt` on
   relation members (the resolver already holds the full row record).
3. **Number-format display hints on formula fields** — reuse
   `databaseNumberFormatSchema` on the formula field config so a formula
   column renders currency/percent like a number column. ~10-line schema
   change, large perceived win.
4. **Date fill-in** — `week`/`quarter`/`second`, `startOf`/`endOf` helpers;
   make the unit argument a checked literal (today `dateDiff(a, b, "weaks")`
   type-checks and fails per row).
5. **Descending sort** — `sort(list, key?, direction?)`.
6. **Page property surface** — `page:id`/`page:slug`/`page:icon` are trivial
   `BASE_FIELDS` rows; `page:url`/`page:breadcrumbs` need an injected
   callback on the scope options (keep `PageFormulaSource` structural);
   word count and backlinks are larger (block shards / a link index) and can
   wait.

**New kind (expensive, sequence carefully):**

7. **Option type** — select values project as rename-fragile option *names*;
   `== "Done"` breaks on rename, exactly the bug class id-canonical `prop()`
   was built to kill. An `option` kind carrying `{fieldId, optionId, name,
   color}` with text-equality compatibility closes it. The compat rule in
   `formulaValuesEqual` is the hard part, not the plumbing.
8. **Duration type** — `dateDiff` returns a bare number whose unit lives in a
   string argument. A real duration kind enables `date - date`, `date +
   3 days` (§2.3), and honest formatting ("3d 4h"). Cheap 80% alternative
   first: keep numbers, add `formatDuration`.
9. **Not worth it**: dedicated integer (subtyping cost, display hints cover
   it), percent/currency as types (display hints), person/file types (no such
   field kinds exist yet), range type (`isBetween()` function instead).

**Timezone posture.** There is no timezone logic anywhere: `FormulaDate` is a
local-zone instant plus a `dateOnly` display flag, date *cells* truncate to
local midnight (time-of-day discarded even when the grid renders it), and
projection emits UTC ISO for timed values — so a timed formula date can bucket
into a different calendar day than it displays. Pragmatic fixes before any
zone-aware type: stop discarding cell time parts, and make the
date-only/instant projection symmetric.

## 5. The calculation engine

### 5.1 Shipped fixes

- **Schema-change gating** — the single biggest problem found: `views` live
  on the `LocalDatabase` record, so *every* view tweak (filter, sort, column
  resize — per gesture) took the coarse schema path: full graph rebuild
  (O(D²) parse+checks — ~4,500 at 15 databases × 10 formula fields) plus
  `FORMULA_ALL_ROWS` dirty across the workspace. The shell now compares what
  formulas can observe (`fields` by reference then structurally, `name`,
  `primaryFieldId`) and view-only writes just refresh the mirror.
- **Per-schema field-index memo** — `createFormulaRowScope` built two Maps
  over all fields *per row per pass* (~4M map inserts on a 10k×10 warm pass);
  member access ran a linear field scan per access. One WeakMap-keyed index
  per fields array serves scopes and member resolution.
- **Editor parse memo** — the panel ran `parseFormula` on every render
  (unmemoized), which also invalidated the downstream check/preview memos, so
  every render was a full parse+check+evaluate. Now memoized on the draft.

### 5.2 Roadmap, ranked

1. **Structural overlay sharing** — a one-cell edit currently rebuilds the
   entire per-database overlay Map (10k fresh row entries) and re-copies
   every row in `withFormulaValues` (~300k property writes) before React even
   diffs. Thread evaluated row ids through the notify path and copy-on-write
   only changed entries; make `withFormulaValues` identity-preserving so the
   whole downstream pipeline (filter/sort/group/grid) keeps row identity.
   *This is the dominant per-edit cost.*
2. **Row-major incremental evaluation** — the incremental evaluator builds a
   fresh scope + resolved-map per (column, row); the old one-shot overlay
   built one scope per row. Invert the loop nest within each database (the
   cross-database reads already go through the cache), cutting warm-pass
   allocation ~10×. The warm pass runs synchronously before first paint, so
   this is startup jank at scale.
3. **`db()` hoisting → virtual aggregate nodes** — `db("B").map(…).sum()`
   re-materializes |B| row refs and re-runs the aggregate *per referencing
   row*: O(n·m) with 100M allocations at 10k×10k. Short term: memoize the
   ref list per (pass, database) on the resolver. Real fix: promote
   loop-invariant `db()` subexpressions to synthetic single-value graph nodes
   above the referencing column — `allRows` dirtying then recomputes the
   aggregate once and the equality cutoff decides whether any dependent row
   moves. Also the foundation for per-group aggregates (a same-database
   `db()` + filter-by-own-scalar is a working-but-quadratic group aggregate
   *today* — worth documenting).
4. **User-function dirty precision** — editing one definition marks every
   formula column in the workspace all-rows dirty. The reference walk already
   knows which functions each formula calls (it maintains the visited set for
   recursion); record `usedUserFunctions` per column and dirty only callers.
   ~2 hours of work.
5. **Lazy `display` projection** — every cell computes an `Intl` display
   string that only error cells and two niche consumers read (~100k wasted
   formats per warm pass).
6. **Delete the dead one-shot overlay** — `computeFormulaOverlay` has zero
   production callers (the engine serves all views) but keeps a complete
   parallel implementation of plan/cycle/topo/evaluate alive for parity
   tests. Keep `computeFormulaRowValues` (editor preview, templates); re-point
   parity tests at an all-dirty engine pass. Also: extract `formulaCheckContext`
   and friends out of `lib/databases/` so `formula-engine/` stops importing
   *up* the layer stack (the "pure core" claim is currently untrue).
7. **Member canonicalization** — `r.Estimate` resolves by *name*; renaming a
   target field silently breaks every rollup reading it, as a runtime error
   value. The only correctness item on the deferred list; ~3 days on top of
   the existing rewriter machinery. Prioritize above the remaining deferred
   items.
8. **Save-time cross-database cycle rejection** — `buildFormulaGraph` on the
   draft at save time (never per keystroke — that's the O(D²) trap); one more
   Save-gating condition. ~Half a day after item 6's extraction.
9. **Evaluation budget / chunking** — the dirty map is already a perfect
   resumption token; a `deadline` option that returns unfinished dirty state
   would let the shell spread all-rows passes across frames. ~20 lines in the
   core; eliminates the remaining synchronous-pass jank independent of the
   allocation work.
10. **Persistent value cache** — serialize the cache (4 tagged shapes; lambdas
    never reach cells) with a workspace fingerprint (schema + functions + row
    watermark) to IndexedDB, so reload hydrates instead of recomputing.
    Depends on item 1's change-detection primitives.

Also worth recording: `ROW_AWARE_FUNCTIONS` in `references.ts` hardcodes a
list that must agree with the catalog — a new row-preserving list function
silently degrades dirty precision. Derive it from catalog signatures (or an
explicit `rowAware` field beside them).

## 6. Mobile: from workable to Numbers-class

### 6.1 Shipped P0s

- **Full operator key set** — the accessory row shipped `( ) , " + - * / .
  ==`: a third of the language, with `==` but no `!=` and no inequality at
  all (the reason an operator row exists). Now grouped families: punctuation,
  `+ - * / &`, all six comparisons, `?? and or not`, `. =>` — every
  comparison, the blank fallback, and the lambda arrow reachable without the
  symbol keyboard's second plane.
- **The sheet uses its room** — the drawer is 88svh but the editor was capped
  at the base theme's 8rem scroller with 12px type. Sheet layout now gets
  `min-h-32`/`36svh` and `text-sm` (16px in the textarea fallback, killing
  iOS focus auto-zoom).
- **Blocked Done explains itself** — Done was a silently dead `disabled`
  button. It stays tappable (`aria-disabled`), fires the `disabled` boundary
  haptic, and force-expands the status pill.
- **Touch targets** — status pill and preview-row picker (20px!) bumped to
  ≥36px on coarse pointers.
- **CM6 warm from the column menu** — the chunk was warmed only by inline
  tokens, so the first mobile edit of every session got the degraded textarea
  (no chips, no placeholder snippets, silently different insert behavior).
  The column menu now warms on open over a formula column.

### 6.2 Roadmap, ranked

1. **Undo/redo/dismiss keys on the accessory row** — there is *no undo at
   all* on mobile (CM6 history exists but only via Mod-Z; iOS keyboards have
   no Cmd). A mis-tap is unrecoverable short of Cancel-and-restart. Extend
   the editor handle with `undo`/`redo`/`blur`, pin a trailing key group,
   fire the `disabled` haptic on an empty history stack. Highest
   severity-per-line on the whole mobile list.
2. **Sheet-ify canvas inline formulas** — on phones, inline formula tokens
   open the 720px desktop popover clamped to ~366px: two cramped columns, the
   plain textarea (no chips, no accessory row), no keyboard avoidance, and a
   dead `onCancel`. Route coarse pointers to the same `layout="sheet"` drawer
   the column path uses. This is the worst formula surface in the app and the
   one prose writers hit most.
3. **Type-driven picker sheets for placeholders** — the deferred §7 headline
   and the difference between "workable" and "differentiator". All pieces
   exist: `expectedArgumentType` (currently used only for completion
   ranking), the placeholder state field, the press interception, the picker
   drawer chrome. Tap a `unit` placeholder → enum sheet; a property-shaped
   one → property picker; boolean → true/false; date → date picker. Prefetch:
   a snippet whose first placeholder is closed-typed opens its picker
   immediately — pick `dateAdd` and it *asks you for a date*, which is
   exactly Apple Numbers.
4. **Collapse the double header** — the "sheet" is a drawer-in-a-drawer with
   a Back chevron ~10px above a Cancel button that dismisses a different
   amount of stack, plus a drag handle: four exits, three destinations.
   Escalate the coarse-pointer formula path to a dedicated top-level drawer,
   the way fine pointers escalate to the dialog.
5. **Docs on mobile** — function-picker rows get an expandable
   description+example (both already rendered on desktop and computed then
   discarded on mobile); the rollup wizard's `onShowDetail` currently renders
   into a void in the sheet — inline the details instead. Relocate the
   argument info card into the accessory row's leading slot (the row telling
   you which argument you're on is the Numbers move).
6. **Rollup into the accessory row** — the wizard (the "compose rollups
   without touching the keyboard" flow) is below the fold under the keyboard;
   promote it to a third leading button opening its own picker drawer.
7. **All-diagnostics pill with tap-to-locate** — the pill shows only
   `diagnostics[0]` as prose with a character offset (useless on a phone);
   list all diagnostics as tappable rows that select the offending span, and
   phrase placeholder-span diagnostics as "Fill in `unit`" rather than
   `Unknown name`.
8. **Keyboard-aware sheet** — only the accessory row tracks the keyboard;
   nothing scrolls the caret into view and the sheet's `pb-16` is a static
   guess. Extract a `useKeyboardInsetPx()` from the toolbar-anchor hook.
   Landscape is currently unusable (88svh ≈ 343px minus a ~200px keyboard).
9. **Test the real surface** — every existing sheet test suppresses the CM6
   mount, so the actual mobile editor (snippets, chips, placeholder pills)
   has zero coverage on the sheet path.

## 7. Sequencing

- **P0 (this PR)**: everything marked [shipped] above.
- **P1 — engine economics**: §5.2 items 1–2 (overlay sharing, row-major
  evaluation), then 4–6. These are pure-implementation wins with parity tests
  already in place.
- **P2 — mobile completion**: §6.2 items 1–2 (undo, inline-formula sheet),
  then 3 (placeholder pickers) as the headline feature.
- **P3 — language naturalness**: reserved-word migration machinery, then
  `in` + infix `contains`, percent literals.
- **P4 — types**: text/regex/date fill-ins and row-metadata properties
  (cheap), then the option type, then duration + unit literals (which unlock
  §2.3's `due + 3 days`).
- **P5 — deep engine**: `db()` virtual nodes, member canonicalization,
  save-time cycle rejection, persistent cache.
