/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { databaseTemplatePageId } from "@/lib/databases/database-template-page.ts";
import { readRowTemplateSnapshot } from "@/lib/databases/row-template-store.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";

/**
 * @fileoverview What a row page inherits from its template. The template page
 * IS the design of every row page, so the display settings its ⋯ menu offers
 * have to travel with the blocks — a template set in Serif at full width must
 * open its rows that way.
 */

const store = vi.hoisted(() => ({
  record: null as LocalPage | null,
}));

vi.mock("@/db/collections/local-collections.ts", () => ({
  localPagesCollection: { get: () => store.record ?? undefined },
}));

vi.mock("@/db/queries/read-bootstrap-page-blocks.ts", () => ({
  readBootstrapPageBlocks: () => ({ blocks: [] }),
}));

const DATABASE_ID = "db-1";

function templateRecord(settings: Partial<LocalPage>): LocalPage {
  return {
    id: databaseTemplatePageId(DATABASE_ID),
    slug: "template",
    title: "Template",
    parentId: null,
    serverBaselineHash: null,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...settings,
  } as LocalPage;
}

beforeEach(() => {
  store.record = null;
});

describe("readRowTemplateSnapshot", () => {
  it("carries the template's font, text size, and full width", () => {
    store.record = templateRecord({
      font: "serif",
      fullWidth: true,
      icon: "🚀",
      textScale: "large",
    });

    expect(readRowTemplateSnapshot(DATABASE_ID)).toMatchObject({
      font: "serif",
      fullWidth: true,
      icon: "🚀",
      textScale: "large",
    });
  });

  it("leaves untouched settings unset so rows keep the page defaults", () => {
    store.record = templateRecord({});

    const snapshot = readRowTemplateSnapshot(DATABASE_ID);

    expect(snapshot?.font).toBeUndefined();
    expect(snapshot?.fullWidth).toBeUndefined();
    expect(snapshot?.textScale).toBeUndefined();
  });

  it("reports no template rather than an empty one when the page is gone", () => {
    expect(readRowTemplateSnapshot(DATABASE_ID)).toBeNull();
  });

  it("treats a tombstoned template as absent", () => {
    store.record = templateRecord({ deletedAt: "2024-02-01T00:00:00.000Z" });

    expect(readRowTemplateSnapshot(DATABASE_ID)).toBeNull();
  });
});
