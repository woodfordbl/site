# site

Personal site of [Blake Woodford](https://linkedin.com/in/blakewoodford), built as a
local-first workspace platform: a TanStack Start app whose TanStack DB collections
persist to localStorage/IndexedDB, layered over shipped blog content that renders
from build-time JSON.

## Repository layout

pnpm workspace monorepo:

- `apps/web` — the TanStack Start application (routes, editor, collections,
  Nitro API handlers, scripts).
- `packages/` — reserved for shared packages as they materialize.
- `docs/proposals/` — active design plans (sync engine, file mirror, platform
  architecture).
- `dev/` — local development infrastructure.

## Running it

```sh
pnpm install
pnpm dev
```

`pnpm test`, `pnpm typecheck`, `pnpm check`, and `pnpm check:size` are the
commit gates (root scripts delegate into `apps/web`).

## Architecture in brief

TanStack Start + Nitro on Vercel. The canvas editor is a custom command-bus
design (UI → commands → reducer → effects → TanStack DB transactions); pages
and blocks are flat, id-keyed rows; shipped content renders server-side and is
lazily seeded into local collections on first edit. Documentation lives in the
code as Google-style JSDoc (see `AGENTS.md` for the standard); start from the
`@fileoverview` blocks in `apps/web/src/db/collections/` and
`apps/web/src/lib/canvas/`.
