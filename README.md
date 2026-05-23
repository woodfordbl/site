# Personal Site

TanStack Start personal site with ShadCN UI (Base UI primitives), Tabler icons, and Nitro for Vercel deployment.

## Stack

- **Framework:** TanStack Start + TanStack Router
- **UI:** ShadCN UI on Base UI (`@base-ui/react`)
- **Icons:** Tabler (`@tabler/icons-react`)
- **Styling:** Tailwind CSS v4
- **Deployment:** Nitro (Vercel-compatible SSR)

## Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) (or the next available port).

## Build

```bash
pnpm build
pnpm preview
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

## Deploy to Vercel

This project uses Nitro via `vite.config.ts` — no custom `vercel.json` is required.

### Option A: Standalone repo

1. Push this directory to GitHub as its own repository.
2. Import the project in [Vercel](https://vercel.com/new).
3. Vercel auto-detects TanStack Start + Nitro. Use these defaults:
   - **Build command:** `pnpm build`
   - **Output directory:** leave empty (Nitro handles output in `.output`)
4. Deploy.

### Option B: Monorepo (parent `projects` repo)

If deploying from `/Users/blakelywoodford/Development/projects`:

1. Import the repo in Vercel.
2. Set **Root Directory** to `personal-site`.
3. Build command: `pnpm build` (runs from `personal-site/`).
4. Deploy.

### CLI deploy

```bash
cd personal-site
vercel link
vercel deploy        # preview
vercel deploy --prod # production
```

No environment variables are required for the current blank-page setup.
