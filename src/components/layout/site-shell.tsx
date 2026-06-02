import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
}

export function SiteShell({ children }: SiteShellProps) {
  return (
    <main className="relative flex min-h-svh flex-col">
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
        {children}
      </div>
    </main>
  );
}
