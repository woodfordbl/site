# Personal Site

A small personal site for [Blake Woodford](https://github.com/woodfordbl) that doubles as a playground for the [TanStack](https://tanstack.com/) ecosystem. Built with TanStack Start and deployed on Vercel.

**Live site:** [site-five-bice-36.vercel.app](https://site-five-bice-36.vercel.app)

## What this is

On the surface it's a personal site. Under the hood it's a **local-first, malleable notetaking and data-visualization workspace** — a Notion-style block canvas with pages, embedded databases, and charts, where every edit is written to a local store first and the UI stays instant and offline-capable.

The interesting part is the data layer. It's built on [TanStack DB](https://tanstack.com/db) with a local-first persistence model: user edits land in local collections (currently localStorage-backed shards) and reactive queries drive the canvas. That architecture is deliberately chosen as a stepping stone toward a **sync-engine model** — the collections are designed so a real backing store can be plugged in behind them without rewriting the editor.

### Where it's headed

The roadmap is to swap the local-only persistence for a real sync engine so the workspace becomes **real-time and multi-device**:

- **[ElectricSQL](https://electric-sql.com/)** as the sync engine, streaming changes between clients and the server.
- **Postgres** as the source-of-truth backing store for pages, blocks, and databases.
- Keep the local-first UX (instant, offline-capable) while gaining real-time collaboration and durable server state.

TanStack DB is the seam that makes this possible — the same collections and reactive queries the canvas already uses can be fed from an Electric/Postgres sync stream instead of localStorage.

## Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) + TanStack Router
- **Data layer:** [TanStack DB](https://tanstack.com/db) — local-first collections + reactive queries (`@tanstack/react-db`, `@tanstack/query-db-collection`), backed by [TanStack Query](https://tanstack.com/query)
- **Editor:** Custom block-canvas editor (pages, blocks, embedded databases) — not BlockNote/Tiptap
- **Data viz:** [Recharts](https://recharts.org/) via database chart views, with `@tanstack/react-table` + `@tanstack/react-virtual` for the grids
- **UI:** [ShadCN UI](https://ui.shadcn.com/) on [Base UI](https://base-ui.com/) (`@base-ui/react`)
- **Icons:** [Tabler](https://tabler.io/icons) (`@tabler/icons-react`)
- **Styling:** Tailwind CSS v4
- **Linting:** [Ultracite](https://www.ultracite.ai/) + Biome
- **Deployment:** [Nitro](https://nitro.build/) (Vercel-compatible SSR)

## Development

Requires [Node.js 22+](https://nodejs.org/) and [pnpm 10.22.0](https://pnpm.io/) (see `packageManager` in `package.json`).

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

The block canvas, pages, embedded databases, and the local-first data layer are documented under [`docs/`](docs/README.md). Good starting points:

- [Architecture overview](docs/architecture/overview.md)
- [Local-first persistence](docs/architecture/local-first-persistence.md) — the seam a sync engine plugs into
- [Canvas editor](docs/architecture/canvas-editor.md) and [block model](docs/architecture/block-model.md)
- [Databases](docs/architecture/databases.md) — typed fields, saved views, and charts

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start the dev server |
| `pnpm build` | Production build (TanStack Start + Nitro) |
| `pnpm preview` | Preview the production build locally |
| `pnpm check` | Lint and format validation (Ultracite) |
| `pnpm fix` | Auto-fix lint and formatting issues |
| `pnpm typecheck` | TypeScript check (`tsc --noEmit`) |
| `pnpm test` | Run Vitest tests |

## Linting and formatting

This project uses Ultracite with Biome. Cursor auto-formats on save via `.vscode/settings.json`. `.cursor/hooks.json` runs `pnpm fix` after each agent file edit, tracks structural paths for doc sync, and on turn end may delegate the **docs-sync** subagent when `pnpm docs:check` fails. See [docs/contributing/updating-docs.md](docs/contributing/updating-docs.md).

```bash
pnpm check
pnpm fix
pnpm dlx ultracite doctor
```

## Adding ShadCN components

```bash
pnpm dlx shadcn@latest add button card
```

When using Tabler icons inside components like `Button`, add `data-icon="inline-start"` or `data-icon="inline-end"` on the icon for correct spacing:

```tsx
import { IconArrowRight } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

<Button>
  Continue
  <IconArrowRight data-icon="inline-end" />
</Button>
```

## CI and deployment

GitHub Actions runs on every pull request and push to `main`:

- **lint** — `pnpm check`
- **typecheck** — `pnpm typecheck`
- **build** — `pnpm build`

[Vercel](https://vercel.com/blake-7563s-projects/site) handles preview and production deploys via the GitHub integration. Production domain aliasing is gated by Vercel Deployment Checks that require the same three GitHub Actions jobs to pass.

`main` is protected: merges require `lint`, `typecheck`, and `build` to succeed.

No environment variables are required for the current setup.

## Deploy locally with Vercel CLI

```bash
vercel link
vercel deploy        # preview
vercel deploy --prod # production
```

Nitro is configured in `vite.config.ts` — no custom `vercel.json` is required.
