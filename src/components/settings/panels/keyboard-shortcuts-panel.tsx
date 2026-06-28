"use client";

import { KeyboardShortcutRow } from "@/components/settings/panels/keyboard-shortcut-row.tsx";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell.tsx";
import { getSettingsSection } from "@/components/settings/site-settings-sections.ts";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item.tsx";
import { SequenceShortcut, Shortcut } from "@/components/ui/shortcut.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import {
  COMMAND_GROUPS,
  getCommandsInGroup,
  KEYBOARD_SEQUENCES,
  SEQUENCE_GROUP,
} from "@/lib/settings/keyboard-commands.ts";
import type { SettingsSearch } from "@/lib/settings/settings-search.ts";
import { useResolvedKeybindings } from "@/lib/settings/use-keybindings.ts";

interface KeyboardShortcutsPanelProps {
  search: SettingsSearch;
}

export function KeyboardShortcutsPanel({
  search,
}: KeyboardShortcutsPanelProps) {
  const section = getSettingsSection("shortcuts");
  const resolved = useResolvedKeybindings();
  const isCoarsePointer = useIsCoarsePrimaryPointer();

  if (isCoarsePointer) {
    return (
      <SettingsPanelShell
        description="Keyboard shortcuts apply to devices with a keyboard."
        search={search}
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
      description="Common shortcuts for navigation and canvas editing. Editable shortcuts can be rebound; structural editor keys are fixed."
      search={search}
      section={section}
    >
      {COMMAND_GROUPS.map((group) => (
        <section className="flex flex-col gap-3" key={group}>
          <h2 className="font-medium text-sm">{group}</h2>
          <ItemGroup className="gap-2">
            {getCommandsInGroup(group).map((command) =>
              command.customizable ? (
                <KeyboardShortcutRow
                  command={command}
                  key={command.id}
                  resolved={resolved}
                />
              ) : (
                <Item key={command.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{command.label}</ItemTitle>
                  </ItemContent>
                  <ItemActions>
                    <Shortcut command={command.id} />
                  </ItemActions>
                </Item>
              )
            )}
          </ItemGroup>
        </section>
      ))}
      <section className="flex flex-col gap-3">
        <h2 className="font-medium text-sm">{SEQUENCE_GROUP}</h2>
        <ItemGroup className="gap-2">
          {KEYBOARD_SEQUENCES.map((command) => (
            <Item key={command.id} variant="outline">
              <ItemContent>
                <ItemTitle>{command.label}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <SequenceShortcut sequence={command.sequence} />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </section>
    </SettingsPanelShell>
  );
}
