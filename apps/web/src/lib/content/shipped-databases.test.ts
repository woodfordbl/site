/**
 * @fileoverview Integrity checks over the hand-maintained shipped content in
 * `content/`: every `database` block on a shipped page must have a matching
 * `content/databases/{id}.json`, and every document's internal field
 * references must resolve.
 *
 * These files are authored by the dev save-all flow but edited by hand, and a
 * dangling reference is invisible until a reader opens the page — a page whose
 * database has no document renders an "unavailable" placeholder where a table
 * was meant to be.
 */
import { describe, expect, it } from "vitest";

import { getShippedDatabases } from "@/lib/content/database-store.server.ts";
import { getShippedPages } from "@/lib/content/page-store.server.ts";
import type { DatabaseDocument } from "@/lib/schemas/database-document.ts";

/** Database ids referenced by a `database` block on any shipped page. */
function referencedDatabaseIds(): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const page of getShippedPages()) {
    for (const block of page.blocks) {
      if (block.type !== "database") {
        continue;
      }
      const { databaseId } = block.props;
      if (!databaseId) {
        continue;
      }
      byId.set(databaseId, [...(byId.get(databaseId) ?? []), page.slug]);
    }
  }
  return byId;
}

function fieldIds(doc: DatabaseDocument): Set<string> {
  return new Set(doc.database.fields.map((field) => field.id));
}

/** Field ids a view references, paired with the config key naming each one. */
function viewFieldRefs(doc: DatabaseDocument): [string, string][] {
  const refs: [string, string][] = [];
  for (const view of doc.database.views) {
    const label = `${doc.database.name} / ${view.name}`;
    if (view.groupBy) {
      refs.push([`${label} groupBy`, view.groupBy.fieldId]);
    }
    for (const sort of view.sorts ?? []) {
      refs.push([`${label} sort`, sort.fieldId]);
    }
    for (const fieldId of view.visibleFieldIds ?? []) {
      refs.push([`${label} visibleFieldIds`, fieldId]);
    }
    for (const fieldId of Object.keys(view.config.calculations ?? {})) {
      refs.push([`${label} calculations`, fieldId]);
    }
    const { map } = view.config;
    for (const key of [
      "latFieldId",
      "lngFieldId",
      "coordFieldId",
      "labelFieldId",
      "colorFieldId",
      "joinFieldId",
      "valueFieldId",
    ] as const) {
      const fieldId = map?.[key];
      if (fieldId) {
        refs.push([`${label} map.${key}`, fieldId]);
      }
    }
  }
  return refs;
}

describe("shipped content", () => {
  it("parses every database document", () => {
    // getShippedDatabases throws on a schema violation; the count guards
    // against the glob silently matching nothing.
    expect(getShippedDatabases().length).toBeGreaterThan(0);
  });

  it("ships a document for every database block on a page", () => {
    const shipped = new Set(
      getShippedDatabases().map((entry) => entry.doc.database.id)
    );
    const dangling = [...referencedDatabaseIds()]
      .filter(([databaseId]) => !shipped.has(databaseId))
      .map(([databaseId, slugs]) => `${databaseId} (on ${slugs.join(", ")})`);

    expect(dangling).toEqual([]);
  });

  it("ships no database document nothing references", () => {
    const referenced = referencedDatabaseIds();
    const orphans = getShippedDatabases()
      .map((entry) => entry.doc.database.id)
      .filter((databaseId) => !referenced.has(databaseId));

    expect(orphans).toEqual([]);
  });

  it("resolves every field reference inside a document", () => {
    const unresolved: string[] = [];
    for (const { doc } of getShippedDatabases()) {
      const ids = fieldIds(doc);
      if (!ids.has(doc.database.primaryFieldId)) {
        unresolved.push(`${doc.database.name} primaryFieldId`);
      }
      for (const [label, fieldId] of viewFieldRefs(doc)) {
        if (!ids.has(fieldId)) {
          unresolved.push(`${label} → ${fieldId}`);
        }
      }
      for (const row of doc.rows) {
        for (const fieldId of Object.keys(row.values)) {
          if (!ids.has(fieldId)) {
            unresolved.push(`${doc.database.name} row ${row.id} → ${fieldId}`);
          }
        }
      }
    }

    expect(unresolved).toEqual([]);
  });

  it("stores only valid option ids in select cells", () => {
    const invalid: string[] = [];
    for (const { doc } of getShippedDatabases()) {
      const selectFields = doc.database.fields.filter(
        (field) => field.type === "select"
      );
      for (const field of selectFields) {
        const optionIds = new Set(field.options.map((option) => option.id));
        for (const row of doc.rows) {
          const value = row.values[field.id];
          if (typeof value === "string" && !optionIds.has(value)) {
            invalid.push(`${doc.database.name} row ${row.id} → ${value}`);
          }
        }
      }
    }

    expect(invalid).toEqual([]);
  });
});
