import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { type CsvCell, parseCsv, printCsv } from "@/lib/csv/csv.ts";
import { parseBlocksMarkdown } from "@/lib/markdown-canonical/parse-page.ts";
import { serializeBlocksMarkdown } from "@/lib/markdown-canonical/serialize-page.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import {
  type DatabaseDocument,
  databaseDocumentSchema,
  type ShippedDatabaseDefinition,
  type ShippedDatabaseRow,
  shippedDatabaseDefinitionSchema,
} from "@/lib/schemas/database-document.ts";

/**
 * The database folder format — `content/databases/{id}/`:
 *
 * - `index.md` — the definition (fields, views, source) as YAML frontmatter;
 *   the body is the row-page template in canonical markdown.
 * - `rows.csv` — ALL rows' properties, one line per row: `id` column first,
 *   then one column per non-formula field (headed by the field NAME when
 *   unique, else the field id), plus a `#order` column when manual order
 *   exists. Select/multiSelect cells store option NAMES (ids live in the
 *   definition); values that can't map by name fall back to raw ids.
 *
 * A property-only database is `index.md + rows.csv`; connector databases
 * ship `index.md` alone (the sync engine repopulates rows client-side).
 * Parse(serialize(doc)) reproduces the document exactly — content hashes
 * (`hashDatabaseDocument`) are encoding-independent, so the seeder's
 * baseline flow is untouched.
 */

const ORDER_COLUMN = "#order";

const DEFINITION_KEY_ORDER = [
  "id",
  "name",
  "icon",
  "primaryFieldId",
  "source",
  "fields",
  "views",
] as const;

function printDefinition(definition: ShippedDatabaseDefinition): string {
  const { rowTemplate: _rowTemplate, ...rest } = definition;
  const ordered: Record<string, unknown> = {};
  for (const key of DEFINITION_KEY_ORDER) {
    const value = (rest as Record<string, unknown>)[key];
    if (value !== undefined) {
      ordered[key] = value;
    }
  }
  for (const [key, value] of Object.entries(rest)) {
    if (!(key in ordered) && value !== undefined) {
      ordered[key] = value;
    }
  }
  return stringifyYaml(ordered, { lineWidth: 0 }).trimEnd();
}

/** Field name when unique among sibling columns; the stable id otherwise. */
function columnHeaders(fields: DatabaseField[]): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const field of fields) {
    nameCounts.set(field.name, (nameCounts.get(field.name) ?? 0) + 1);
  }
  const headers = new Map<string, string>();
  for (const field of fields) {
    const unique =
      nameCounts.get(field.name) === 1 &&
      field.name.length > 0 &&
      field.name !== "id" &&
      field.name !== ORDER_COLUMN;
    headers.set(field.id, unique ? field.name : field.id);
  }
  return headers;
}

function optionNameById(field: DatabaseField): Map<string, string> | null {
  if (field.type !== "select" && field.type !== "multiSelect") {
    return null;
  }
  const names = new Map<string, number>();
  for (const option of field.options) {
    names.set(option.name, (names.get(option.name) ?? 0) + 1);
  }
  const byId = new Map<string, string>();
  for (const option of field.options) {
    const usable =
      names.get(option.name) === 1 &&
      option.name.length > 0 &&
      !option.name.includes("|");
    if (usable) {
      byId.set(option.id, option.name);
    }
  }
  return byId;
}

function optionIdByName(field: DatabaseField): Map<string, string> {
  const byName = new Map<string, string>();
  if (field.type === "select" || field.type === "multiSelect") {
    for (const option of field.options) {
      byName.set(option.name, option.id);
    }
  }
  return byName;
}

function encodeCell(
  value: DatabaseCellValue | undefined,
  field: DatabaseField
): CsvCell {
  if (value === undefined || value === null) {
    return null;
  }
  switch (field.type) {
    case "checkbox":
      return value === true ? "true" : "false";
    case "number":
      return typeof value === "number" ? String(value) : String(value);
    case "select": {
      const names = optionNameById(field);
      return typeof value === "string"
        ? (names?.get(value) ?? value)
        : String(value);
    }
    case "multiSelect": {
      const names = optionNameById(field);
      const ids = Array.isArray(value) ? value : [String(value)];
      const mapped = ids.map((id) => names?.get(id) ?? id);
      // A name containing the separator can't join safely — fall back to ids.
      return mapped.some((name) => name.includes("|"))
        ? ids.join("|")
        : mapped.join("|");
    }
    default:
      return typeof value === "string" ? value : String(value);
  }
}

function decodeCell(
  cell: CsvCell,
  field: DatabaseField
): DatabaseCellValue | undefined {
  if (cell === null) {
    return;
  }
  switch (field.type) {
    case "checkbox":
      return cell === "true";
    case "number": {
      const parsed = Number.parseFloat(cell);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    case "select":
      return optionIdByName(field).get(cell) ?? cell;
    case "multiSelect": {
      if (cell.length === 0) {
        return [];
      }
      const byName = optionIdByName(field);
      return cell.split("|").map((token) => byName.get(token) ?? token);
    }
    default:
      return cell;
  }
}

function csvFields(definition: ShippedDatabaseDefinition): DatabaseField[] {
  return definition.fields.filter((field) => field.type !== "formula");
}

function printRowsCsv(doc: DatabaseDocument): string | null {
  if (doc.rows.length === 0) {
    return null;
  }
  const fields = csvFields(doc.database);
  const headers = columnHeaders(fields);
  const hasOrder = doc.rows.some((row) => row.order !== undefined);

  const headerRow: CsvCell[] = [
    "id",
    ...fields.map((field) => headers.get(field.id) ?? field.id),
    ...(hasOrder ? [ORDER_COLUMN] : []),
  ];
  const rows = doc.rows.map((row) => [
    row.id,
    ...fields.map((field) => encodeCell(row.values[field.id], field)),
    ...(hasOrder ? [row.order === undefined ? null : String(row.order)] : []),
  ]);
  return printCsv([headerRow, ...rows]);
}

function parseRowsCsv(
  rowsCsv: string,
  definition: ShippedDatabaseDefinition
): ShippedDatabaseRow[] {
  const table = parseCsv(rowsCsv);
  const [header, ...lines] = table;
  if (!header) {
    return [];
  }

  const fields = csvFields(definition);
  const fieldByHeader = new Map<string, DatabaseField>();
  for (const field of fields) {
    fieldByHeader.set(field.id, field);
    fieldByHeader.set(field.name, field);
  }

  const columns = header.map((cell) => (cell === null ? "" : cell));
  return lines.map((line, lineIndex) =>
    parseRowLine(line, lineIndex, columns, fieldByHeader)
  );
}

function parseRowLine(
  line: CsvCell[],
  lineIndex: number,
  columns: string[],
  fieldByHeader: Map<string, DatabaseField>
): ShippedDatabaseRow {
  const values: Record<string, DatabaseCellValue> = {};
  let id = `row-${lineIndex}`;
  let order: number | undefined;
  columns.forEach((column, columnIndex) => {
    const cell = line[columnIndex] ?? null;
    if (column === "id") {
      if (cell !== null && cell.length > 0) {
        id = cell;
      }
      return;
    }
    if (column === ORDER_COLUMN) {
      const parsed = Number.parseFloat(cell ?? "");
      order = Number.isFinite(parsed) ? parsed : undefined;
      return;
    }
    const field = fieldByHeader.get(column);
    if (!field) {
      return;
    }
    const value = decodeCell(cell, field);
    if (value !== undefined) {
      values[field.id] = value;
    }
  });
  return { id, values, ...(order === undefined ? {} : { order }) };
}

export interface DatabaseFolderFiles {
  indexMd: string;
  /** Absent when the database ships no rows (connector databases). */
  rowsCsv: string | null;
}

export function serializeDatabaseFolder(
  doc: DatabaseDocument
): DatabaseFolderFiles {
  const frontmatter = printDefinition(doc.database);
  const template = doc.database.rowTemplate;
  const body =
    template && template.length > 0 ? serializeBlocksMarkdown(template) : "";
  const indexMd =
    body.length > 0
      ? `---\n${frontmatter}\n---\n\n${body}`
      : `---\n${frontmatter}\n---\n`;
  return { indexMd, rowsCsv: printRowsCsv(doc) };
}

const FRONTMATTER_FENCE_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function parseDatabaseFolder(
  files: DatabaseFolderFiles
): DatabaseDocument {
  const match = FRONTMATTER_FENCE_RE.exec(files.indexMd);
  if (!match || match[1] === undefined) {
    throw new Error("Database index.md is missing its frontmatter fence");
  }
  const parsed: unknown = parseYaml(match[1]);
  const body = files.indexMd.slice(match[0].length);
  const template =
    body.trim().length > 0
      ? parseBlocksMarkdown(body, {
          pageId: `db-template-${(parsed as { id?: string }).id ?? "unknown"}`,
        })
      : undefined;

  const definition = shippedDatabaseDefinitionSchema.parse({
    ...(parsed as Record<string, unknown>),
    ...(template === undefined ? {} : { rowTemplate: template }),
  });

  const rows =
    files.rowsCsv === null ? [] : parseRowsCsv(files.rowsCsv, definition);
  return databaseDocumentSchema.parse({ database: definition, rows });
}
