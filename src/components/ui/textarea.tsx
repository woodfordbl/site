import type * as React from "react";

import { cn } from "@/lib/utils.ts";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "field-sizing-content flex min-h-16 w-full rounded-lg border border-border bg-input/30 px-2.5 py-2 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-0 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-0 aria-invalid:ring-destructive/20 aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:disabled:bg-input/80 dark:aria-invalid:focus-visible:border-destructive/50 dark:aria-invalid:focus-visible:ring-destructive/40",
        className
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
