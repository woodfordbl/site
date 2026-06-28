import type { ReactNode } from "react";

import { cn } from "@/lib/utils.ts";

interface AnalyticsSectionProps {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}

/** A titled card used as the building block of the analytics dashboard. */
export function AnalyticsSection({
  title,
  description,
  action,
  children,
  className,
}: AnalyticsSectionProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        className
      )}
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-sm">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
        {action ? <div className="sm:shrink-0">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}
