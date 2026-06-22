import { describe, expect, it } from "vitest";

import { mergeLocalPageSources } from "@/lib/pages/merge-local-page-sources.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

function stub(id: string, title: string): LocalPage {
  return {
    id,
    slug: `/${id}`,
    title,
    parentId: null,
    serverBaselineHash: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("mergeLocalPageSources", () => {
  it("keeps cookie rows when the live collection snapshot is still empty", () => {
    const cookie = [stub("notes", "Notes")];
    const merged = mergeLocalPageSources(cookie, []);

    expect(merged.map((page) => page.id)).toEqual(["notes"]);
  });

  it("lets the live collection override cookie rows for the same id", () => {
    const cookie = [stub("about", "About (cookie)")];
    const live = [stub("about", "About (live)")];
    const merged = mergeLocalPageSources(cookie, live);

    expect(merged).toEqual(live);
  });
});
