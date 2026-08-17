import { useState } from "react";

import { exportWorkspaceArchive } from "@/lib/content/workspace-export.ts";
import {
  importWorkspaceArchive,
  WorkspaceImportError,
  type WorkspaceImportMode,
} from "@/lib/content/workspace-import.ts";

export interface WorkspaceArchiveStatus {
  details?: string[];
  message: string;
  tone: "error" | "info" | "success";
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export interface UseWorkspaceArchiveOptions {
  onAfterImport?: () => void;
}

export function useWorkspaceArchive(options?: UseWorkspaceArchiveOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [status, setStatus] = useState<WorkspaceArchiveStatus | null>(null);

  const exportWorkspace = async () => {
    setIsExporting(true);
    setStatus({ tone: "info", message: "Preparing export…" });
    try {
      const result = await exportWorkspaceArchive();
      const parts = [countLabel(result.pageCount, "page")];
      if (result.assetCount > 0) {
        parts.push(countLabel(result.assetCount, "media file"));
      }
      const missing = result.missingAssetIds.length;
      setStatus({
        tone: missing > 0 ? "info" : "success",
        message: `Exported ${parts.join(" and ")}.`,
        details:
          missing > 0
            ? [
                `${countLabel(missing, "referenced media file")} could not be found and ${missing === 1 ? "was" : "were"} skipped.`,
              ]
            : undefined,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: "Export failed.",
        details: [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setIsExporting(false);
    }
  };

  const importWorkspace = async (file: File, mode: WorkspaceImportMode) => {
    setIsImporting(true);
    setStatus({ tone: "info", message: "Importing workspace…" });
    try {
      const result = await importWorkspaceArchive(file, mode);
      const parts = [countLabel(result.importedPages, "page")];
      if (result.restoredAssets > 0) {
        parts.push(countLabel(result.restoredAssets, "media file"));
      }
      setStatus({
        tone: result.warnings.length > 0 ? "info" : "success",
        message: `Imported ${parts.join(" and ")}.`,
        details: result.warnings.length > 0 ? result.warnings : undefined,
      });
      options?.onAfterImport?.();
    } catch (error) {
      setStatus({
        tone: "error",
        message: "Import failed.",
        details:
          error instanceof WorkspaceImportError
            ? error.errors
            : [error instanceof Error ? error.message : String(error)],
      });
    } finally {
      setIsImporting(false);
    }
  };

  return { exportWorkspace, importWorkspace, isExporting, isImporting, status };
}
