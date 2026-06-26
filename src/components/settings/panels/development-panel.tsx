"use client";

import { PageCanvasConfirmDialog } from "@/components/canvas/page-canvas-confirm-dialog.tsx";
import {
  SettingsItemButton,
  SettingsItemCard,
  SettingsItemField,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import {
  type PageCanvasFooterActionsInput,
  usePageCanvasFooterActions,
} from "@/hooks/use-page-canvas-footer-actions.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

interface DevelopmentPanelProps extends PageCanvasFooterActionsInput {
  search: SettingsSearch;
}

export function DevelopmentPanel({
  onAfterReset,
  pageId,
  search,
}: DevelopmentPanelProps) {
  const section = getSettingsSection("development");
  const {
    confirmAction,
    handleConfirm,
    hasLocalChanges,
    hasUpdates,
    isDev,
    saveStatus,
    setConfirmAction,
    visible,
  } = usePageCanvasFooterActions({ onAfterReset, pageId });

  if (!visible) {
    return (
      <SettingsPanelShell
        description="No local changes or dev actions are available right now."
        search={search}
        section={section}
      />
    );
  }

  return (
    <SettingsPanelShell
      description="Save local edits to source files, refresh from the site, or reset local changes."
      search={search}
      section={section}
    >
      {saveStatus ? (
        <p className="text-muted-foreground text-sm">{saveStatus}</p>
      ) : null}

      <SettingsItemCard>
        {hasUpdates ? (
          <SettingsItemField
            action={
              <SettingsItemButton
                onClick={() => {
                  setConfirmAction("refresh");
                }}
              >
                Refresh
              </SettingsItemButton>
            }
            description="Replace stale pages with the latest published version."
            title="Refresh site content"
          />
        ) : null}
        {isDev ? (
          <SettingsItemField
            action={
              <SettingsItemButton
                onClick={() => {
                  setConfirmAction("saveAll");
                }}
              >
                Save all
              </SettingsItemButton>
            }
            description="Write every locally-edited page to content/pages."
            title="Save all"
          />
        ) : null}
        {hasLocalChanges ? (
          <>
            <SettingsItemField
              action={
                <SettingsItemButton
                  onClick={() => {
                    setConfirmAction("reset");
                  }}
                >
                  Reset page
                </SettingsItemButton>
              }
              description="Restore this page to the shipped site version."
              title="Reset page"
            />
            <SettingsItemField
              action={
                <SettingsItemButton
                  onClick={() => {
                    setConfirmAction("resetAll");
                  }}
                  variant="destructive"
                >
                  Reset all
                </SettingsItemButton>
              }
              description="Remove all local edits and custom pages."
              title="Reset all"
            />
          </>
        ) : null}
      </SettingsItemCard>

      <PageCanvasConfirmDialog
        confirmAction={confirmAction}
        onConfirm={handleConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
      />
    </SettingsPanelShell>
  );
}
