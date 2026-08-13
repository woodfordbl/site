import { eq, useLiveQuery } from "@tanstack/react-db";
import { createContext, type ReactNode, useContext, useMemo } from "react";

import {
  localDatabaseRowsCollection,
  localDatabasesCollection,
} from "@/db/collections/local-collections.ts";
import { useLocalPagesSnapshot } from "@/hooks/use-local-pages.ts";
import { databaseIdFromTemplatePageId } from "@/lib/databases/database-template-page.ts";
import type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";
import { resolveRowDefaultValues } from "@/lib/databases/row-defaults.ts";
import type { PageFormulaSource } from "@/lib/formula/page-scope.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";

export type { InlineFormulaPageModel } from "@/lib/databases/page-formula-fields.ts";

/**
 * The page that inline formula tokens evaluate `thisPage` against.
 *
 * A context rather than a prop: a token can sit in any rich-text field at any
 * depth of the block tree, and threading the page through every block type
 * would put a page-shaped parameter on components that have no other reason to
 * know about pages.
 *
 * Null outside a page (a database cell, a standalone field). Tokens there stay
 * pending rather than resolving against the wrong page — which is only ever a
 * theoretical state today, since a token can be inserted only into page prose.
 *
 * On database row pages (`databaseRowSource`) and row-template pages
 * (`db-template:…`), `databaseFields` / `cellValues` layer the database's
 * columns onto the base page fields so `thisPage.Tags` resolves like a row
 * template token, and `thisRow` is a synonym of `thisPage`. On ordinary
 * pages `thisRow` is a bare name, not a scope root.
 */

const InlineFormulaPageContext = createContext<InlineFormulaPageModel | null>(
  null
);

const EMPTY_DATABASE_FIELDS: readonly DatabaseField[] = [];
const EMPTY_CELL_VALUES: Record<string, DatabaseCellValue> = {};

export function useInlineFormulaPage(): InlineFormulaPageModel | null {
  return useContext(InlineFormulaPageContext);
}

interface InlineFormulaPageProviderProps {
  children: ReactNode;
  /** Selected-row context for template Live Preview; skips inferred defaults. */
  modelOverride?: InlineFormulaPageModel;
  pageId: string;
  /** Shipped title, used until the page has a local row. */
  title: string;
}

export function InlineFormulaPageProvider({
  children,
  modelOverride,
  pageId,
  title,
}: InlineFormulaPageProviderProps) {
  // The collection snapshot, not `useLocalPages`: this provider wraps the whole
  // canvas, including surfaces that render without a route context.
  const pages = useLocalPagesSnapshot();
  const localPage = pages.find((entry) => entry.id === pageId);
  const createdAt = localPage?.createdAt;
  const updatedAt = localPage?.updatedAt;
  const localTitle = localPage?.title;

  const rowSource = localPage?.databaseRowSource;
  const templateDatabaseId = databaseIdFromTemplatePageId(pageId);
  const databaseId = rowSource?.databaseId ?? templateDatabaseId ?? "";
  const rowId = rowSource?.rowId ?? "";

  const { data: databases = [] } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const database = databases[0];

  const { data: rows = [] } = useLiveQuery(
    (query) =>
      query
        .from({ row: localDatabaseRowsCollection })
        .where(({ row }) => eq(row.id, rowId)),
    [rowId]
  );
  const row = rows[0];

  const page = useMemo<PageFormulaSource>(
    () => ({
      title: localTitle ?? title,
      // A shipped page with no local row yet has no timestamps of its own;
      // blank parses to an empty date rather than a wrong one.
      createdAt: createdAt ?? "",
      updatedAt: updatedAt ?? "",
    }),
    [createdAt, localTitle, title, updatedAt]
  );

  const databaseFields = database?.fields ?? EMPTY_DATABASE_FIELDS;
  const cellValues = useMemo<Record<string, DatabaseCellValue>>(() => {
    if (!database) {
      return EMPTY_CELL_VALUES;
    }
    if (rowSource !== undefined && row !== undefined) {
      return row.values;
    }
    if (templateDatabaseId !== null) {
      return resolveRowDefaultValues(database);
    }
    return EMPTY_CELL_VALUES;
  }, [database, row, rowSource, templateDatabaseId]);

  const inferredValue = useMemo<InlineFormulaPageModel>(
    () => ({
      page,
      databaseFields,
      cellValues,
    }),
    [cellValues, databaseFields, page]
  );
  const value = modelOverride ?? inferredValue;

  return (
    <InlineFormulaPageContext.Provider value={value}>
      {children}
    </InlineFormulaPageContext.Provider>
  );
}
