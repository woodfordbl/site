import type { ReactNode } from "react";

interface SiteShellProps {
  children: ReactNode;
}

export function SiteShell({ children }: SiteShellProps) {
  return (
    <main className="relative flex h-svh w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      {children}
    </main>
  );
}
