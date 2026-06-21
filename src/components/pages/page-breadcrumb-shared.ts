import { buttonVariants } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export const PAGE_BREADCRUMB_CRUMB_CLASS = cn(
  buttonVariants({ variant: "ghost", size: "sm" }),
  "min-w-0 justify-start"
);

export const PAGE_BREADCRUMB_CHILDREN_LIMIT = 5;
