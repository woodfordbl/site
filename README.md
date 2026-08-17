# site

Personal site of [Blake Woodford](https://linkedin.com/in/blakewoodford), built as a
local-first workspace platform: a TanStack Start app whose TanStack DB collections
boot in one of two modes — anonymous visitors get localStorage-backed collections,
signed-in users (Better Auth workspaces) get Electric-protocol sync against Postgres.

## Running it

```sh
pnpm install
pnpm dev
```

That is the whole loop for local-only mode. To run the optional sync backend:

1. Start Postgres with logical replication (`wal_level=logical`) — either a local
   install (apt) or Docker via `pnpm electric:up` (see `dev/electric/`).
2. Apply the schema: `node apps/web/scripts/db-migrate.mjs`.

`pnpm test`, `pnpm typecheck`, `pnpm check`, and `pnpm check:size` must pass before
committing. `pnpm test` includes the access-model integration suite when
`DATABASE_URL` points at a migrated Postgres, and skips it otherwise.

## Documentation

Docs live in the code as JSDoc — start at `AGENTS.md` for the standard.
`docs/proposals/` holds active design plans; there is no other markdown tree.

## Architecture

TanStack Start + TanStack Router on Nitro; ShadCN on Base UI, Tabler icons,
Tailwind v4; TanStack DB for the reactive client store; Zod schemas in
`src/lib/schemas/`; server pages are JSON in `content/pages/` bundled at build
time. Capabilities nest: Pages → Canvas (block rows, commands, editor) → Blocks.

| Layer | Path |
| ----- | ---- |
| UI primitives | `src/components/ui/` |
| Layout | `src/components/layout/` |
| Blocks / Canvas / Pages | `src/components/{blocks,canvas,pages}/` |
| Routes | `src/routes/` (API routes in `routes/api/`, registered in `vite.config.ts`) |
| Data | `src/db/` (collections + reactive `use-*` queries) |
| Core logic | `src/lib/canvas/`, `src/lib/pages/` (pure, no React) |

Request flow: a route loader loads the server page JSON (or the client resolves a
user page from its collection), `buildBlockTree` shapes it, and
`PageWorkspace → PageCanvas → BlockTreeNode` renders it. Edits dispatch a
`CanvasCommand` through the canvas reducer, which plans effects applied to the
TanStack DB collections — persisted per mode to localStorage shards or synced
via Electric.
