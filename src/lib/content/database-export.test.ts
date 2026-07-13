import { describe, expect, it } from "vitest";

import {
  exportDatabaseDocument,
  hashDatabaseDocument,
} from "@/lib/content/database-export.ts";
import type {
  LocalDatabase,
  LocalDatabaseRow,
} from "@/lib/schemas/database.ts";
import { databaseDocumentSchema } from "@/lib/schemas/database-document.ts";

const NOW = "2026-07-01T00:00:00.000Z";

function makeDatabase(overrides: Partial<LocalDatabase> = {}): LocalDatabase {
  return {
    id: "db-1",
    name: "Reading list",
    primaryFieldId: "f-title",
    fields: [{ id: "f-title", name: "Title", type: "text" }],
    views: [{ id: "v-1", name: "Table", type: "table", config: {} }],
    serverBaselineHash: "abcd1234",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRow(
  id: string,
  overrides: Partial<LocalDatabaseRow> = {}
): LocalDatabaseRow {
  return {
    id,
    databaseId: "db-1",
    values: { "f-title": id },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("exportDatabaseDocument", () => {
  it("strips local-only bookkeeping and validates against the shipped schema", () => {
    const doc = exportDatabaseDocument(makeDatabase(), [
      makeRow("r-1", { pageId: "page-1", order: 1 }),
    ]);

    expect(databaseDocumentSchema.parse(doc)).toEqual(doc);
    expect(doc.database).not.toHaveProperty("createdAt");
    expect(doc.database).not.toHaveProperty("updatedAt");
    expect(doc.database).not.toHaveProperty("serverBaselineHash");
    expect(doc.rows[0]).not.toHaveProperty("databaseId");
    expect(doc.rows[0]).not.toHaveProperty("pageId");
    expect(doc.rows[0]).not.toHaveProperty("createdAt");
  });

  it("excludes connector-synced rows and other databases' rows", () => {
    const doc = exportDatabaseDocument(makeDatabase(), [
      makeRow("r-local"),
      makeRow("r-synced", { externalId: "ext-1" }),
      makeRow("r-foreign", { databaseId: "db-2" }),
    ]);

    expect(doc.rows.map((row) => row.id)).toEqual(["r-local"]);
  });

  it("orders rows deterministically (manual order, id tiebreaker)", () => {
    const doc = exportDatabaseDocument(makeDatabase(), [
      makeRow("r-z"),
      makeRow("r-a"),
      makeRow("r-last", { order: 5 }),
      makeRow("r-first", { order: 1 }),
    ]);

    expect(doc.rows.map((row) => row.id)).toEqual([
      "r-first",
      "r-last",
      "r-a",
      "r-z",
    ]);
  });
});

describe("hashDatabaseDocument", () => {
  it("is row-order independent (hand-edited JSON hashes like a re-export)", () => {
    const rows = [makeRow("r-1", { order: 1 }), makeRow("r-2", { order: 2 })];
    const forward = exportDatabaseDocument(makeDatabase(), rows);
    const reversed = {
      ...forward,
      rows: [...forward.rows].reverse(),
    };

    expect(hashDatabaseDocument(reversed)).toBe(hashDatabaseDocument(forward));
  });

  it("changes when content changes", () => {
    const base = exportDatabaseDocument(makeDatabase(), [makeRow("r-1")]);
    const renamed = exportDatabaseDocument(
      makeDatabase({ name: "Watch list" }),
      [makeRow("r-1")]
    );

    expect(hashDatabaseDocument(base)).not.toBe(hashDatabaseDocument(renamed));
  });

  it("round-trips through a seeded local copy unchanged", () => {
    // Seed a local copy from the shipped doc (attach local bookkeeping), then
    // re-export — the hash must match, or the seeder would misread every
    // pristine copy as edited.
    const shipped = exportDatabaseDocument(makeDatabase(), [
      makeRow("r-1", { order: 1 }),
    ]);
    const seededDatabase: LocalDatabase = {
      ...shipped.database,
      serverBaselineHash: hashDatabaseDocument(shipped),
      createdAt: NOW,
      updatedAt: NOW,
    };
    const seededRows: LocalDatabaseRow[] = shipped.rows.map((row) => ({
      ...row,
      databaseId: shipped.database.id,
      createdAt: NOW,
      updatedAt: NOW,
    }));

    const reExported = exportDatabaseDocument(seededDatabase, seededRows);
    expect(hashDatabaseDocument(reExported)).toBe(
      seededDatabase.serverBaselineHash
    );
  });
});
