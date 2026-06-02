// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  backfillPageCreatedAt,
  CREATED_AT_BACKFILL_FLAG_KEY,
  LEGACY_PAGES_KEY,
} from "@/db/collections/migrate-local-storage.ts";

describe("backfillPageCreatedAt", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("sets createdAt from updatedAt when missing", () => {
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        "page-1": {
          data: {
            id: "page-1",
            slug: "/notes",
            title: "Notes",
            parentId: null,
            serverBaselineHash: null,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    backfillPageCreatedAt();

    const stored = JSON.parse(
      localStorage.getItem(LEGACY_PAGES_KEY) ?? "{}"
    ) as Record<string, { data: { createdAt?: string; updatedAt?: string } }>;

    expect(stored["page-1"]?.data.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(localStorage.getItem(CREATED_AT_BACKFILL_FLAG_KEY)).toBe("done");
  });

  it("leaves records that already have createdAt unchanged", () => {
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        "page-1": {
          data: {
            id: "page-1",
            slug: "/notes",
            title: "Notes",
            parentId: null,
            serverBaselineHash: null,
            createdAt: "2025-12-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    backfillPageCreatedAt();

    const stored = JSON.parse(
      localStorage.getItem(LEGACY_PAGES_KEY) ?? "{}"
    ) as Record<string, { data: { createdAt?: string } }>;

    expect(stored["page-1"]?.data.createdAt).toBe("2025-12-01T00:00:00.000Z");
  });

  it("runs only once", () => {
    localStorage.setItem(CREATED_AT_BACKFILL_FLAG_KEY, "done");
    localStorage.setItem(
      LEGACY_PAGES_KEY,
      JSON.stringify({
        "page-1": {
          data: {
            id: "page-1",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          versionKey: "2026-01-01T00:00:00.000Z",
        },
      })
    );

    backfillPageCreatedAt();

    const stored = JSON.parse(
      localStorage.getItem(LEGACY_PAGES_KEY) ?? "{}"
    ) as Record<string, { data: { createdAt?: string } }>;

    expect(stored["page-1"]?.data.createdAt).toBeUndefined();
  });
});
