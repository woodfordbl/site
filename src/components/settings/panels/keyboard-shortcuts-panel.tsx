"use client";

import {
  KeyboardSequenceRow,
  KeyboardShortcutRow,
  KeyboardShortcutStaticRow,
} from "@/components/settings/panels/keyboard-shortcut-row.tsx";
import { SettingsItemCard } from "@/components/settings/settings-item-card.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  COMMAND_GROUPS,
  getCommandsInGroup,
  KEYBOARD_SEQUENCES,
  SEQUENCE_GROUP,
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
      description="Every keyboard shortcut. Record a new combo or reset to default on the rebindable ones."
      section={section}
    >
      {COMMAND_GROUPS.map((group) => {
        const commands = getCommandsInGroup(group);
        if (commands.length === 0) {
          return null;
        }
        return (
          <section className="flex flex-col gap-3" key={group}>
            <h2 className="font-medium text-sm">{group}</h2>
            <SettingsItemCard>
              {commands.map((command) =>
                command.customizable ? (
                  <KeyboardShortcutRow
                    command={command}
                    key={command.id}
                    resolved={resolved}
                  />
                ) : (
                  <KeyboardShortcutStaticRow
                    command={command}
                    key={command.id}
                  />
                )
              )}
            </SettingsItemCard>
          </section>
        );
      })}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">{SEQUENCE_GROUP}</h2>
        <SettingsItemCard>
          {KEYBOARD_SEQUENCES.map((sequence) => (
            <KeyboardSequenceRow key={sequence.id} sequence={sequence} />
          ))}
        </SettingsItemCard>
      </section>
    </SettingsPanelShell>
  );
}
