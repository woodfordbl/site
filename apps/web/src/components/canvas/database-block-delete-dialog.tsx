import { DeleteDatabaseConfirmDialog } from "@/components/pages/delete-database-confirm-dialog.tsx";
import { useLocalDatabasesSnapshot } from "@/hooks/use-local-databases.ts";

interface DatabaseBlockDeleteDialogProps {
  /** Databases a pending canvas delete would remove, else `null` (closed). */
  databaseIds: string[] | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation shown when deleting a `database` block from the canvas. The
 * block is the database's canvas presence, so removing it deletes the entity
 * (definition, rows, hub page) and every other linked view — this mirrors the
 * sidebar "Delete database?" dialog rather than silently dropping the block.
 */
export function DatabaseBlockDeleteDialog({
  databaseIds,
  onCancel,
  onConfirm,
}: DatabaseBlockDeleteDialogProps) {
  const databases = useLocalDatabasesSnapshot();
  const databaseNames = (databaseIds ?? []).flatMap((databaseId) => {
    const name = databases.find((database) => database.id === databaseId)?.name;
    return name ? [name] : [];
  });

  return (
    <DeleteDatabaseConfirmDialog
      databaseNames={databaseNames}
      onConfirm={onConfirm}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      open={databaseIds !== null}
    />
  );
}
