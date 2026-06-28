import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { WorkspaceImportMode } from "@/lib/content/workspace-import.ts";

interface WorkspaceImportDialogProps {
  file: File | null;
  isImporting: boolean;
  onConfirm: (mode: WorkspaceImportMode) => void;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceImportDialog({
  file,
  isImporting,
  onConfirm,
  onOpenChange,
}: WorkspaceImportDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={file !== null}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Import workspace</DialogTitle>
          <DialogDescription>
            {file ? `Open "${file.name}". ` : ""}Choose how to apply it to your
            current workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">Merge</span>
            <span className="text-muted-foreground">
              Add and overwrite pages from the archive, keeping your other local
              pages.
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">Replace</span>
            <span className="text-muted-foreground">
              Clear the current workspace first, then load the archive. Existing
              local edits are discarded.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={isImporting}
            onClick={() => onConfirm("merge")}
            type="button"
            variant="outline"
          >
            Merge
          </Button>
          <Button
            disabled={isImporting}
            onClick={() => onConfirm("replace")}
            type="button"
            variant="destructive"
          >
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
