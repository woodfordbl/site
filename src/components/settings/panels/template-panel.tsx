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
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { pageNavTargetForUserPage } from "@/lib/pages/slugify.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

const TEMPLATE_PAGE_TITLE = "Page template";

interface TemplatePanelProps {
  search: SettingsSearch;
}

export function TemplatePanel({ search }: TemplatePanelProps) {
  const navigate = useNavigate();
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);
  const { clearTemplatePage, setTemplatePageId, templatePageId } =
    useTemplatePage();
  const section = getSettingsSection("template");

  // Decide Create-vs-manage on the id alone (available instantly via the SSR
  // hint) so a not-yet-hydrated page list can't briefly offer "Create" and spawn
  // a second template. The lookup only gates the Edit navigation target.
  const hasTemplate = templatePageId !== null;
  const templatePage = templatePageId
    ? pages.find((page) => page.id === templatePageId)
    : undefined;

  const createTemplate = () => {
    const id = crypto.randomUUID();
    dispatch({
      type: "page.create",
      pageId: id,
      title: TEMPLATE_PAGE_TITLE,
      navigate: true,
    });
    setTemplatePageId(id);
  };

  const editTemplate = () => {
    if (templatePage) {
      navigate(pageNavTargetForUserPage(templatePage.slug));
    }
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
                <SettingsItemButton onClick={clearTemplatePage} variant="ghost">
                  Remove
                </SettingsItemButton>
                <SettingsItemButton
                  disabled={!templatePage}
                  onClick={editTemplate}
                >
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
              ? "New pages copy this page's content and settings. Edit it to change the default."
              : "Create a template page. Its content and settings become the starting point for every new page."
          }
          title="Page template"
        />
      </SettingsItemCard>
    </SettingsPanelShell>
  );
}
