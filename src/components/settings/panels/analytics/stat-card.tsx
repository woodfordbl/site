import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

interface StatCardProps {
  accent?: boolean;
  hint?: ReactNode;
  icon?: ReactNode;
  isLoading?: boolean;
  label: string;
  value: ReactNode;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = false,
  isLoading = false,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10",
        accent ? "bg-muted/50" : "bg-card"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-muted-foreground text-xs">
          {label}
        </span>
        {icon ? (
          <span className="text-muted-foreground/70 [&>svg]:size-4 [&>svg]:stroke-[1.5px]">
            {icon}
          </span>
        ) : null}
      </div>
      {isLoading ? (
        <Skeleton className="mt-1 h-8 w-20" />
      ) : (
        <span className="font-heading font-semibold text-2xl tabular-nums leading-tight tracking-tight">
          {value}
        </span>
      )}
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  );
}
