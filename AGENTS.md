# Engineering conventions

Formatting and mechanical lint rules are enforced by Ultracite/Biome
(`pnpm check`, `pnpm fix`) and are not restated here. This file covers what
tooling cannot enforce.

## Documentation: JSDoc, not markdown

Documentation lives **in the code** as Google-style JSDoc. The repository
carries no markdown documentation tree; the only permitted markdown files are
the root `README.md` (repo landing) and `docs/proposals/*` (active design
plans, scheduled for relocation).

- Every module with non-obvious behavior opens with a `@fileoverview` block:
  what the module is, the contracts and invariants it upholds, and the
  gotchas a maintainer must know. Complete sentences, third person, present
  tense.
- Every exported symbol gets a JSDoc block stating what it does and any
  non-obvious constraint. One line is fine when one line is true.
- Documentation states **contracts, invariants, and why** — never narration
  of the implementation, change history, or comparisons with other tools.
  If the code says it, the doc must not repeat it.
- Cross-reference code with `{@link symbol}` or a `path/to/file.ts` mention,
  never a `docs/…` path.

## Size and complexity limits

- **Files: 600 lines max.** Enforced by `pnpm check:size`
  (`scripts/check-file-length.mjs`) as a ratchet: files already over the cap
  are grandfathered at their current length and may only shrink; new files
  and new violations fail the check.
- **Cognitive complexity: 15 per function** (Biome
  `noExcessiveCognitiveComplexity`). Extract, don't nest.

## Forbidden patterns

- **Shared Tailwind class-string constants** (`export const buttonClass =
  "rounded-md …"`). Use the `components/ui` primitives or `cva` variants;
  a class string may only be a local constant when it is a *data lookup*
  (e.g. a color-id → class map), never a reusable style token.
- **Forwarding wrappers**: a function whose body is a single call to another
  function with the same arguments is indirection, not abstraction — call
  the target directly.
- **Barrel files** and re-export-only modules.
- **Speculative generality**: no options, parameters, or abstractions without
  a second live caller.

## Project facts

- TanStack Start + Nitro; API routes live in `routes/api/` and are registered
  explicitly in `vite.config.ts` (no filesystem scanning).
- Content collections (`src/db/collections/`) are mode-forked at boot:
  anonymous → localStorage, signed-in → Electric-protocol sync. See the
  `@fileoverview` blocks in `src/db/collections/` for the contracts.
- `pnpm test` (vitest), `pnpm typecheck`, `pnpm check` (lint), and
  `pnpm check:size` must all pass before a commit.
