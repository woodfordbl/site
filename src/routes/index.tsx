import { createFileRoute } from "@tanstack/react-router"
import { IconBrandGithub, IconMail } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/")({ component: LandingPage })

function LandingPage() {
  return (
    <main className="relative flex min-h-svh flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.97_0_0),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,oklch(0.22_0_0),transparent_55%)]" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-muted-foreground mb-4 text-sm tracking-[0.2em] uppercase">
          Personal site
        </p>

        <h1 className="text-foreground mb-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Blake Woodford
        </h1>

        <p className="text-muted-foreground mb-8 max-w-xl text-lg leading-relaxed text-pretty">
          Building thoughtful software. This site is the home for my work, writing,
          and experiments.
        </p>

        <div className="flex flex-wrap gap-3">
          <Button render={<a href="https://github.com/woodfordbl" target="_blank" rel="noreferrer" />}>
            <IconBrandGithub data-icon="inline-start" />
            GitHub
          </Button>
          <Button
            variant="outline"
            render={<a href="mailto:hello@woodford.dev" />}
          >
            <IconMail data-icon="inline-start" />
            Contact
          </Button>
        </div>
      </div>

      <footer className="text-muted-foreground relative px-6 py-8 text-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} Blake Woodford</span>
          <span>TanStack Start · ShadCN · Base UI</span>
        </div>
      </footer>
    </main>
  )
}
