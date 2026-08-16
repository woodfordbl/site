import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

interface StatCardProps {
  hint?: ReactNode;
  icon?: ReactNode;
  isLoading?: boolean;
  label: string;
  /** When set, the card becomes a selectable tab button. */
  onSelect?: () => void;
  selected?: boolean;
  value: ReactNode;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  isLoading = false,
  onSelect,
  selected = false,
}: StatCardProps) {
  const interactive = onSelect != null;

  const body = (
    <>
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
    </>
  );

  const className = cn(
    "flex flex-col gap-1 rounded-xl p-4 text-left ring-1 transition-colors",
    selected ? "bg-muted/60 ring-foreground/15" : "bg-card ring-foreground/10",
    interactive &&
      !selected &&
      "hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  );

  if (interactive) {
    return (
      <button
        aria-pressed={selected}
        className={className}
        onClick={onSelect}
        type="button"
      >
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
