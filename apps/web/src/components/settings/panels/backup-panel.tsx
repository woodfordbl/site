"use client";

import { useState } from "react";

import {
  SettingsItemButton,
  SettingsItemCard,
  SettingsItemField,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { WorkspaceImportDialog } from "@/components/settings/workspace-import-dialog.tsx";
import { DropUpload } from "@/components/ui/drop-upload.tsx";
import type { WorkspaceArchiveStatus } from "@/hooks/use-workspace-archive.ts";
import { useWorkspaceArchive } from "@/hooks/use-workspace-archive.ts";
import type { WorkspaceImportMode } from "@/lib/content/workspace-import.ts";
import { cn } from "@/lib/utils.ts";

interface BackupPanelProps {
  onAfterImport?: () => void;
}

const STATUS_TONE_CLASS: Record<WorkspaceArchiveStatus["tone"], string> = {
  error: "text-destructive",
  info: "text-muted-foreground",
  success: "text-foreground",
};

export function BackupPanel({ onAfterImport }: BackupPanelProps) {
  const section = getSettingsSection("backup");
  const { exportWorkspace, importWorkspace, isExporting, isImporting, status } =
    useWorkspaceArchive({ onAfterImport });

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  const handleConfirmImport = (mode: WorkspaceImportMode) => {
    const file = pendingFile;
    setPendingFile(null);
    if (file) {
      importWorkspace(file, mode).catch(() => undefined);
    }
  };

  return (
    <SettingsPanelShell
      description="Export your whole workspace to a .zip backup, or open one to restore or move your content."
      section={section}
    >
      {status ? (
        <div className="flex flex-col gap-1">
          <p className={cn("text-sm", STATUS_TONE_CLASS[status.tone])}>
            {status.message}
          </p>
          {status.details && status.details.length > 0 ? (
            <ul
              className={cn(
                "flex list-disc flex-col gap-0.5 pl-5 text-sm",
                status.tone === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
              )}
            >
              {status.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <SettingsItemCard>
        <SettingsItemField
          action={
            <SettingsItemButton
              disabled={isExporting}
              onClick={exportWorkspace}
            >
              {isExporting ? "Exporting…" : "Export"}
            </SettingsItemButton>
          }
          description="Download every page and its media as a single .zip file."
          title="Export workspace"
        />
      </SettingsItemCard>

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-foreground text-sm">
            Import workspace
          </h2>
          <p className="text-muted-foreground text-sm">
            Open a .zip backup. You'll choose whether to replace or merge before
            anything changes.
          </p>
        </div>
        <DropUpload
          accept=".zip,application/zip"
          busy={isImporting}
          busyLabel="Importing…"
          hint="or drag and drop"
          label="Choose a .zip backup"
          onFiles={(files) => {
            setRejection(null);
            setPendingFile(files[0] ?? null);
          }}
          onReject={setRejection}
        />
        {rejection ? (
          <p className="text-destructive text-sm">{rejection}</p>
        ) : null}
      </div>

      <WorkspaceImportDialog
        file={pendingFile}
        isImporting={isImporting}
        onConfirm={handleConfirmImport}
        onOpenChange={(open) => {
          if (!open) {
            setPendingFile(null);
          }
        }}
      />
    </SettingsPanelShell>
  );
}
