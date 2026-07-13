import { describe, expect, it } from "vitest";

import { hashDatabaseDocument } from "@/lib/content/database-export.ts";
import { parseCsv, printCsv } from "@/lib/csv/csv.ts";
import type { DatabaseDocument } from "@/lib/schemas/database-document.ts";

import {
  parseDatabaseFolder,
  serializeDatabaseFolder,
} from "./database-folder.ts";

describe("csv codec", () => {
  it("round-trips quoting, commas, newlines, and the null/empty split", () => {
    const rows = [
      ["id", "Name", "Notes"],
      ["r1", 'has "quotes"', "a,b"],
      ["r2", "", null],
      ["r3", "line\nbreak", "plain"],
    ];
    expect(parseCsv(printCsv(rows))).toEqual(rows);
  });
});

const DOC: DatabaseDocument = {
  database: {
    id: "reading-list",
    name: "Reading List",
    icon: "📚",
    primaryFieldId: "f-title",
    fields: [
      { id: "f-title", name: "Title", type: "text" },
      {
        id: "f-status",
        name: "Status",
        type: "select",
        options: [
          { id: "o-reading", name: "Reading", color: "blue" },
          { id: "o-done", name: "Done", color: "green" },
        ],
      },
      {
        id: "f-tags",
        name: "Tags",
        type: "multiSelect",
        options: [
          { id: "o-scifi", name: "Sci-Fi" },
          { id: "o-classic", name: "Classic" },
        ],
      },
      { id: "f-rating", name: "Rating", type: "number", format: "integer" },
      { id: "f-done", name: "Finished", type: "checkbox" },
      { id: "f-date", name: "Finished On", type: "date" },
      { id: "f-formula", name: "Score", type: "formula", expression: "1 + 1" },
    ],
    views: [
      {
        id: "v-all",
        name: "All",
        type: "table",
        config: { columnWidths: { "f-title": 240 } },
      },
    ],
    rowTemplate: [
      {
        id: "t1",
        type: "heading",
        props: { level: 2, text: "Notes" },
      },
    ],
  },
  rows: [
    {
      id: "r-snow-crash",
      values: {
        "f-title": "Snow Crash",
        "f-status": "o-done",
        "f-tags": ["o-scifi", "o-classic"],
        "f-rating": 5,
        "f-done": true,
        "f-date": "2026-05-14",
      },
      order: 1000,
    },
    {
      id: "r-empty",
      values: { "f-title": "" },
    },
  ],
} as DatabaseDocument;

describe("database folder format", () => {
  it("round-trips the document (template block ids re-mint deterministically)", () => {
    const files = serializeDatabaseFolder(DOC);
    const back = parseDatabaseFolder(files);
    const stripTemplateIds = (doc: DatabaseDocument) => ({
      ...doc,
      database: {
        ...doc.database,
        rowTemplate: doc.database.rowTemplate?.map(
          ({ id: _id, ...rest }) => rest
        ),
      },
    });
    expect(stripTemplateIds(back)).toEqual(stripTemplateIds(DOC));

    // Hashes converge after one trip: minted ids are stable across reparses.
    const twice = parseDatabaseFolder(serializeDatabaseFolder(back));
    expect(twice).toEqual(back);
    expect(hashDatabaseDocument(twice)).toBe(hashDatabaseDocument(back));
  });

  it("encodes select/multiSelect cells by option name", () => {
    const files = serializeDatabaseFolder(DOC);
    expect(files.rowsCsv).toContain("Done");
    expect(files.rowsCsv).toContain("Sci-Fi|Classic");
    expect(files.rowsCsv).not.toContain("o-done");
  });

  it("keeps the row template as canonical markdown in the body", () => {
    const files = serializeDatabaseFolder(DOC);
    expect(files.indexMd).toContain("## Notes");
  });

  it("ships definition-only folders for row-less databases", () => {
    const files = serializeDatabaseFolder({
      database: DOC.database,
      rows: [],
    });
    expect(files.rowsCsv).toBeNull();
    const back = parseDatabaseFolder(files);
    expect(back.rows).toEqual([]);
    expect(back.database.fields).toEqual(DOC.database.fields);
    expect(back.database.views).toEqual(DOC.database.views);
  });

  it("is serializer-idempotent", () => {
    const files = serializeDatabaseFolder(DOC);
    const again = serializeDatabaseFolder(parseDatabaseFolder(files));
    expect(again).toEqual(files);
  });
});
