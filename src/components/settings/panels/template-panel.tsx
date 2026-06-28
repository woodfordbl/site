"use client";

import { useNavigate } from "@tanstack/react-router";

import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import {
  SettingsItemButton,
  SettingsItemCard,
  SettingsItemField,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { TEMPLATE_PAGE_ID } from "@/lib/pages/template-page.ts";
import {
  createEmptyTemplate,
  deleteTemplate,
} from "@/lib/pages/template-store.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

interface TemplatePanelProps {
  search: SettingsSearch;
}

export function TemplatePanel({ search }: TemplatePanelProps) {
  const navigate = useNavigate();
  const { clearTemplatePage, setTemplatePageId, templatePageId } =
    useTemplatePage();
  const section = getSettingsSection("template");

  // The template is a standalone snapshot, not a navigable page. Presence is
  // tracked by the SSR cookie hint so a not-yet-hydrated list can't flicker
  // "Create" and spawn a second template.
  const hasTemplate = templatePageId !== null;

  const createTemplate = () => {
    createEmptyTemplate();
    setTemplatePageId(TEMPLATE_PAGE_ID);
    navigate({ to: "/template" });
  };

  const editTemplate = () => {
    navigate({ to: "/template" });
  };

  const removeTemplate = () => {
    deleteTemplate();
    clearTemplatePage();
  };

  return (
    <SettingsPanelShell
      description="Design a page that every new page starts from."
      search={search}
      section={section}
    >
      <SettingsItemCard>
        <SettingsItemField
          action={
            hasTemplate ? (
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
            hasTemplate
              ? "New pages copy this template's content and settings. Edit it to change the default."
              : "Create a template. Its content and settings become the starting point for every new page."
          }
          title="Page template"
        />
      </SettingsItemCard>
    </SettingsPanelShell>
  );
}
