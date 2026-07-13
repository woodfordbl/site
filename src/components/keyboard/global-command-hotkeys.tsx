"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { useCommandSequences } from "@/components/keyboard/use-command-sequences.ts";
import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import { useTemplatePage } from "@/components/pages/template-page-provider.tsx";
import { useCreatePage } from "@/hooks/use-create-page.ts";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { openTemplateEditor } from "@/lib/pages/open-template-editor.ts";

function GlobalCommandHotkeysLive() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { resolvedTheme, setTheme } = useSiteAppearance();
  const { pages } = useMergedPageListItems();
  const createPage = useCreatePage(pages);
  const { setTemplatePageId } = useTemplatePage();

  const openSettings = () =>
    navigate({ search: { returnTo: pathname }, to: "/settings" });
  const openShortcuts = () =>
    navigate({
      params: { section: "shortcuts" },
      search: { returnTo: pathname },
      to: "/settings/$section",
    });

  useCommandHotkeys({
    "edit-template": () => {
      openTemplateEditor(navigate, setTemplatePageId);
    },
    "new-page": () => createPage(),
    "open-settings": openSettings,
    "show-shortcuts": openShortcuts,
    "toggle-theme": () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
  });

  useCommandSequences({
    "go-home": () => navigate({ to: "/" }),
    "go-settings": openSettings,
    "go-shortcuts": openShortcuts,
  });

  return null;
}

/**
 * Mounts app-wide keyboard commands (settings navigation, new page, theme
 * toggle, and the "go to" chords). Client-only: the page-list/dispatch hooks
 * aren't part of SSR and shortcuts only matter once the app is interactive.
 */
export function GlobalCommandHotkeys() {
  const isClient = useIsClient();
  return isClient ? <GlobalCommandHotkeysLive /> : null;
}
