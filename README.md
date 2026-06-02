# Personal Site

Personal site for [Blake Woodford](https://github.com/woodfordbl), built with TanStack Start and deployed on Vercel.

**Live site:** [site-five-bice-36.vercel.app](https://site-five-bice-36.vercel.app)

## Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) + TanStack Router
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
