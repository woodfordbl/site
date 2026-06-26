import { createFileRoute, notFound } from "@tanstack/react-router";
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exports Suspense; Biome types lag
import { lazy, Suspense } from "react";

import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

const ComponentShowcase = import.meta.env.DEV
  ? lazy(() =>
      import("@/components/dev/component-showcase.tsx").then((module) => ({
        default: module.ComponentShowcase,
      }))
    )
  : null;

function DevPage() {
  if (!ComponentShowcase) {
    throw notFound();
  }

  return (
    <Suspense fallback={null}>
      <ComponentShowcase />
    </Suspense>
  );
}

export const Route = createFileRoute("/dev")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  head: () => ({
    meta: buildNoIndexMeta(),
  }),
  component: DevPage,
});
