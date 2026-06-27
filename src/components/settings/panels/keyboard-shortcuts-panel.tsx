"use client";

import {
  SettingsItemCard,
  SettingsItemRow,
} from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { ItemActions, ItemContent, ItemTitle } from "@/components/ui/item.tsx";
import { Kbd, KbdGroup } from "@/components/ui/kbd.tsx";
import { KEYBOARD_SHORTCUT_GROUPS } from "@/lib/settings/keyboard-shortcuts.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";

interface KeyboardShortcutsPanelProps {
  search: SettingsSearch;
}

export function KeyboardShortcutsPanel({
  search,
}: KeyboardShortcutsPanelProps) {
  const section = getSettingsSection("shortcuts");

  return (
    <SettingsPanelShell
      description="Common shortcuts for navigation and canvas editing."
      search={search}
      section={section}
    >
      {KEYBOARD_SHORTCUT_GROUPS.map((group) => (
        <section className="flex flex-col gap-3" key={group.label}>
          <h2 className="font-medium text-sm">{group.label}</h2>
          <SettingsItemCard>
            {group.shortcuts.map((shortcut) => (
              <SettingsItemRow key={`${group.label}-${shortcut.description}`}>
                <ItemContent>
                  <ItemTitle>{shortcut.description}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <KbdGroup>
                    {shortcut.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </ItemActions>
              </SettingsItemRow>
            ))}
          </SettingsItemCard>
        </section>
      ))}
    </SettingsPanelShell>
  );
}
