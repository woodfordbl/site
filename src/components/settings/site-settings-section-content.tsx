"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { PageCommandHotkeys } from "@/components/keyboard/page-command-hotkeys.tsx";
import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { AnalyticsPanel } from "@/components/settings/panels/analytics-panel.tsx";
import { AppearancePanel } from "@/components/settings/panels/appearance-panel.tsx";
import { BackupPanel } from "@/components/settings/panels/backup-panel.tsx";
import { DevelopmentPanel } from "@/components/settings/panels/development-panel.tsx";
import { KeyboardShortcutsPanel } from "@/components/settings/panels/keyboard-shortcuts-panel.tsx";
import {
  DEFAULT_SETTINGS_SECTION,
  type SettingsSectionId,
} from "@/components/settings/site-settings-sections.ts";
import { usePageCanvasFooterActions } from "@/hooks/use-page-canvas-footer-actions.ts";
import {
  resolveSettingsReturnTo,
  type SettingsSearch,
} from "@/lib/settings/settings-search.ts";

interface SiteSettingsSectionContentProps {
  search: SettingsSearch;
  section: SettingsSectionId;
}

export function SiteSettingsSectionContent({
  search,
  section,
}: SiteSettingsSectionContentProps) {
  const navigate = useNavigate();
  const returnTo = resolveSettingsReturnTo(search);
  const pageId = search.pageId ?? "";
  const { visible: showDevelopment } = usePageCanvasFooterActions({ pageId });

  const onAfterReset = () => {
    navigate({ to: returnTo });
  };

  // ⌘Esc returns to the app from settings (the "Back to app" affordance).
  useCommandHotkeys({
    "back-to-app": () => navigate({ to: returnTo }),
  });

  useEffect(() => {
    if (section === "development" && !showDevelopment) {
      navigate({
        params: { section: DEFAULT_SETTINGS_SECTION },
        replace: true,
        search,
        to: "/settings/$section",
      });
    }
  }, [navigate, search, section, showDevelopment]);

  const panel = (() => {
    switch (section) {
      case "appearance":
        return <AppearancePanel search={search} />;
      case "analytics":
        return <AnalyticsPanel search={search} />;
      case "backup":
        return <BackupPanel search={search} />;
      case "development":
        return (
          <DevelopmentPanel
            onAfterReset={onAfterReset}
            pageId={pageId}
            search={search}
          />
        );
      case "shortcuts":
        return <KeyboardShortcutsPanel search={search} />;
      default: {
        const _exhaustive: never = section;
        return _exhaustive;
      }
    }
  })();

  return (
    <>
      {/* Keep page-scoped shortcuts (duplicate/delete/copy-link, sub-page,
          full-width, prev/next) live while in settings, driven by the page the
          user came from, so they aren't dead just because settings is open.
          Cover/icon pickers only exist in the page workspace, so those commands
          stay inert here. */}
      {pageId ? (
        <PageCommandHotkeys
          pageId={pageId}
          seed={undefined}
          serverPage={null}
        />
      ) : null}
      {panel}
    </>
  );
}
