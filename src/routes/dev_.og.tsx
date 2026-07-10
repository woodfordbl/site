import { createFileRoute, notFound } from "@tanstack/react-router";
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exports Suspense; Biome types lag
import { lazy, Suspense } from "react";

import { buildNoIndexMeta } from "@/lib/content/page-head.ts";

const OgPlayground = import.meta.env.DEV
  ? lazy(() =>
      import("@/components/dev/og-playground.tsx").then((module) => ({
        default: module.OgPlayground,
      }))
    )
  : null;

function OgPlaygroundRoute() {
  if (!OgPlayground) {
    throw notFound();
  }

  return (
    <Suspense fallback={null}>
      <OgPlayground />
    </Suspense>
  );
}

export const Route = createFileRoute("/dev_/og")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw notFound();
    }
  },
  head: () => ({ meta: buildNoIndexMeta("Dev") }),
  component: OgPlaygroundRoute,
});
