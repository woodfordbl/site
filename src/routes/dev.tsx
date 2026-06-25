import { createFileRoute } from "@tanstack/react-router";

import { ComponentShowcase } from "@/components/dev/component-showcase.tsx";
import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

export const Route = createFileRoute("/dev")({
  head: () => ({
    meta: buildNoIndexMeta(),
  }),
  component: ComponentShowcase,
});
