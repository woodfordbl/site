/**
 * @fileoverview The formula editor mounted from the column menu: the shared
 * expression editor wired to a database column, plus the coarse-pointer
 * "Edit property" entry that opens it as a nested full-screen studio drawer.
 *
 * Its own module so `database-column-menu.tsx` stays inside the repository's
 * length cap.
 */
import { IconSettings } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import {
  expressionPatch,
  formulaPreviewRows,
} from "@/components/database/database-column-menu-helpers.ts";
import { FormulaEditorPanel } from "@/components/database/formula-editor-panel.tsx";
import { DrawerContent, DrawerNestedRoot } from "@/components/ui/drawer.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { updateDatabaseField } from "@/db/queries/database-collection-ops.ts";
import {
  useAllDatabases,
  useDatabase,
  useDatabaseRows,
} from "@/db/queries/use-database.ts";
import { useFormulaUserFunctions } from "@/db/queries/use-formula-functions.ts";
import { localFormulaRelationResolver } from "@/lib/databases/formula-relations.ts";
import { canonicalizeExpression } from "@/lib/formula/ref-rewrite.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";

interface FormulaExpressionEditorProps {
  databaseId: string;
  field: DatabaseField & { type: "formula" };
  /** Passed through to the panel: `wide` for the dialog host, `studio` for the coarse-pointer full drawer, `sheet` for legacy submenu-drawer hosts. */
  layout?: "sheet" | "stack" | "studio" | "wide";
  /** Sheet layout's Cancel — backs out of the host without saving. */
  onCancel?: () => void;
  /** Opens the function manager dialog; only the wide dialog host wires it. */
  onManageFunctions?: () => void;
  /** Closes the host (column menu or dialog) after Save. */
  onSaved: () => void;
}

/**
 * Formula builder inside the Edit property submenu: threads the live schema
 * and the first rows (manual/table order, capped at
 * `FORMULA_PREVIEW_ROW_LIMIT`, labeled by primary-field text) into the
 * shared `FormulaEditorPanel` so it can render the Properties section and
 * the live preview with its row picker. Mounted only while the submenu is
 * open, so the live queries here cost nothing for non-formula columns. The
 * panel emits field-id canonical text; Save writes it only when it differs
 * from the stored expression's canonical form (evaluation is read-time —
 * the overlay recomputes on write).
 */
export function FormulaExpressionEditor({
  databaseId,
  field,
  layout,
  onCancel,
  onManageFunctions,
  onSaved,
}: FormulaExpressionEditorProps) {
  const title = field.name;
  const database = useDatabase(databaseId);
  const rows = useDatabaseRows(databaseId);
  const relatedDatabases = useAllDatabases();
  const userFunctions = useFormulaUserFunctions();
  const fields = database?.fields ?? [];
  const primaryFieldId = database?.primaryFieldId;
  const previewRows = useMemo(
    () =>
      formulaPreviewRows(
        rows,
        database?.fields.find((candidate) => candidate.id === primaryFieldId)
      ),
    [rows, database?.fields, primaryFieldId]
  );
  // Recreated whenever any database definition changes so the preview's
  // cross-database reads track schema edits; row edits in TARGET databases
  // while the submenu is open stay stale until reopen (non-reactive reads —
  // accepted v1 limitation, see formula-relations.ts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: relatedDatabases is the invalidation signal, not an input
  const relations = useMemo(
    () => localFormulaRelationResolver(),
    [relatedDatabases]
  );

  return (
    <FormulaEditorPanel
      expression={field.expression}
      fields={fields}
      layout={layout}
      onCancel={onCancel}
      onManageFunctions={onManageFunctions}
      onSave={(expression) => {
        if (
          expression !==
          canonicalizeExpression(field.expression, fields, relatedDatabases)
            .text
        ) {
          updateDatabaseField(
            databaseId,
            field.id,
            expressionPatch(expression)
          );
        }
        onSaved();
      }}
      previewRows={previewRows}
      relatedDatabases={relatedDatabases}
      relations={relations}
      selfFieldId={field.id}
      title={title}
      userFunctions={userFunctions}
    />
  );
}
/**
 * "Edit property" for formula columns on coarse pointers: opens the
 * full-screen studio as a drawer NESTED inside the column-menu drawer
 * (`DrawerNestedRoot`), so dismissing the studio lands back on the still-open
 * menu. Save closes both — the edit is done.
 */
export function FormulaStudioDrawerItem({
  databaseId,
  field,
  onRequestClose,
}: {
  databaseId: string;
  field: DatabaseField & { type: "formula" };
  onRequestClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownMenuItem
        closeOnClick={false}
        onClick={() => {
          setOpen(true);
        }}
      >
        <IconSettings />
        Edit property
      </DropdownMenuItem>
      <DrawerNestedRoot onOpenChange={setOpen} open={open}>
        <DrawerContent hasTitle={false} variant="full">
          <div className="flex min-h-0 flex-1 flex-col px-3 pt-1">
            <FormulaExpressionEditor
              databaseId={databaseId}
              field={field}
              layout="studio"
              onCancel={() => {
                setOpen(false);
              }}
              onSaved={() => {
                setOpen(false);
                onRequestClose();
              }}
            />
          </div>
        </DrawerContent>
      </DrawerNestedRoot>
    </>
  );
}
