import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
}

export function SiteShell({ children }: SiteShellProps) {
  return (
    <main className="relative flex h-svh w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground max-md:bg-background max-md:text-foreground">
      {children}
    </main>
  );
}
