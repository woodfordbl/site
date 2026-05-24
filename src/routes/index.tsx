import { IconBrandGithub, IconMail } from "@tabler/icons-react";
import { createFileRoute } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export const Route = createFileRoute("/")({ component: LandingPage });

function LandingPage() {
  return (
    <main className="relative flex min-h-svh flex-col">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(0.97_0_0),transparent_55%)] dark:bg-[radial-gradient(circle_at_top,oklch(0.22_0_0),transparent_55%)]" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <p className="mb-4 text-muted-foreground text-sm uppercase tracking-[0.2em]">
          Personal site
        </p>

        <h1 className="mb-4 text-balance font-semibold text-4xl text-foreground tracking-tight sm:text-5xl">
          Blake Woodford
        </h1>

        <p className="mb-8 max-w-xl text-pretty text-lg text-muted-foreground leading-relaxed">
          Building thoughtful software. This site is the home for my work,
          writing, and experiments.
        </p>

        <div className="flex flex-wrap gap-3">
          <a
            className={cn(buttonVariants())}
            href="https://github.com/woodfordbl"
            rel="noreferrer"
            target="_blank"
          >
            <IconBrandGithub data-icon="inline-start" />
            GitHub
          </a>
          <a
            className={cn(buttonVariants({ variant: "outline" }))}
            href="mailto:hello@woodford.dev"
          >
            <IconMail data-icon="inline-start" />
            Contact
          </a>
        </div>
      </div>

      <footer className="relative px-6 py-8 text-muted-foreground text-sm">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} Blake Woodford</span>
          <span>TanStack Start · ShadCN · Base UI</span>
        </div>
      </footer>
    </main>
  );
}
