"use client";

import { useNavigate, useRouterState } from "@tanstack/react-router";

import { useCommandHotkeys } from "@/components/keyboard/use-command-hotkeys.ts";
import { useCommandSequences } from "@/components/keyboard/use-command-sequences.ts";
import { useSiteAppearance } from "@/components/layout/theme-provider.tsx";
import { useIsClient } from "@/hooks/use-is-client.ts";
import { usePageDispatch } from "@/hooks/use-page-dispatch.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import { DEFAULT_PAGE_TITLE } from "@/lib/pages/default-page-title.ts";

function GlobalCommandHotkeysLive() {
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { resolvedTheme, setTheme } = useSiteAppearance();
  const { pages } = useMergedPageListItems();
  const dispatch = usePageDispatch(pages);

  const openSettings = () =>
    navigate({ search: { returnTo: pathname }, to: "/settings" });
  const openShortcuts = () =>
    navigate({
      params: { section: "shortcuts" },
      search: { returnTo: pathname },
      to: "/settings/$section",
    });

  useCommandHotkeys({
    "new-page": () =>
      dispatch({ title: DEFAULT_PAGE_TITLE, type: "page.create" }),
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
