"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import {
  SettingsItemButton,
  SettingsItemCard,
  SettingsItemField,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import {
  createEmptyTemplate,
  deleteTemplate,
  templateExists,
} from "@/lib/pages/template-store.ts";

export function TemplatePanel() {
  const navigate = useNavigate();
  const isClient = useIsClient();
  const { clearTemplatePage, setTemplatePageId, templatePageId } =
    useTemplatePage();
  const section = getSettingsSection("template");

  const hasTemplateSnapshot = isClient
    ? templateExists()
    : templatePageId !== null;

  useEffect(() => {
    if (!isClient) {
      return;
    }

    if (templateExists()) {
      if (templatePageId !== TEMPLATE_PAGE_ID) {
        setTemplatePageId(TEMPLATE_PAGE_ID);
      }
      return;
    }

    if (templatePageId !== null) {
      clearTemplatePage();
    }
  }, [clearTemplatePage, isClient, setTemplatePageId, templatePageId]);

  const createTemplate = () => {
    createEmptyTemplate();
    setTemplatePageId(TEMPLATE_PAGE_ID);
    navigate({ to: "/template" });
  };

  const editTemplate = () => {
    if (!templateExists()) {
      clearTemplatePage();
      return;
    }

    navigate({ to: "/template" });
  };

  const removeTemplate = () => {
    deleteTemplate();
    clearTemplatePage();
  };

  return (
    <SettingsPanelShell
      description="Design a page that every new page starts from."
      section={section}
    >
      <SettingsItemCard>
        <SettingsItemField
          action={
            hasTemplateSnapshot ? (
              <div className="flex items-center gap-2">
                <SettingsItemButton onClick={removeTemplate} variant="ghost">
                  Remove
                </SettingsItemButton>
                <SettingsItemButton onClick={editTemplate}>
                  Edit template
                </SettingsItemButton>
              </div>
            ) : (
              <SettingsItemButton onClick={createTemplate}>
                Create template
              </SettingsItemButton>
            )
          }
          description={
            hasTemplateSnapshot
              ? "New pages copy this template's content and settings. Edit it to change the default."
              : "Create a template. Its content and settings become the starting point for every new page."
          }
          title="Page template"
        />
      </SettingsItemCard>
    </SettingsPanelShell>
  );
}
