import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
}

export function SiteShell({ children }: SiteShellProps) {
  return (
    <main className="relative flex w-full flex-col bg-sidebar text-sidebar-foreground max-md:min-h-svh max-md:overflow-x-clip max-md:bg-background max-md:text-foreground md:h-svh md:overflow-hidden">
      {children}
    </main>
  );
}
