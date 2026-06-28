"use client";

import { KeyboardShortcutRow } from "@/components/settings/panels/keyboard-shortcut-row.tsx";
import { SettingsItemCard } from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  COMMAND_GROUPS,
  getCommandsInGroup,
} from "@/lib/settings/keyboard-commands.ts";
import { useResolvedKeybindings } from "@/lib/settings/use-keybindings.ts";

export function KeyboardShortcutsPanel() {
  const section = getSettingsSection("shortcuts");
  const resolved = useResolvedKeybindings();
  const isCoarsePointer = useIsCoarsePrimaryPointer();

  if (isCoarsePointer) {
    return (
      <SettingsPanelShell
        description="Keyboard shortcuts apply to devices with a keyboard."
        section={section}
      >
        <p className="text-muted-foreground text-sm">
          Keyboard shortcuts aren&apos;t used on touch devices.
        </p>
      </SettingsPanelShell>
    );
  }

  return (
    <SettingsPanelShell
      description="Rebind any shortcut below — record a new combo or reset it to the default."
      section={section}
    >
      {COMMAND_GROUPS.map((group) => {
        const commands = getCommandsInGroup(group).filter(
          (command) => command.customizable
        );
        if (commands.length === 0) {
          return null;
        }
        return (
          <section className="flex flex-col gap-3" key={group}>
            <h2 className="font-medium text-sm">{group}</h2>
            <SettingsItemCard>
              {commands.map((command) => (
                <KeyboardShortcutRow
                  command={command}
                  key={command.id}
                  resolved={resolved}
                />
              ))}
            </SettingsItemCard>
          </section>
        );
      })}
    </SettingsPanelShell>
  );
}
