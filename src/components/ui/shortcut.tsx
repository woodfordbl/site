import type { Hotkey } from "@tanstack/react-hotkeys";

import { Kbd, KbdGroup } from "@/components/ui/kbd.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { formatHotkeyTokens } from "@/lib/settings/format-hotkey.ts";
import type { CommandId } from "@/lib/settings/keyboard-commands.ts";
import { getCommand } from "@/lib/settings/keyboard-commands.ts";
import { useResolvedKeybindings } from "@/lib/settings/use-keybindings.ts";

type ShortcutProps = {
  className?: string;
} & (
  | {
      /** Render the live binding for a registered command. */
      command: CommandId;
      keys?: never;
    }
  | {
      /** Render an ad-hoc combo not tied to a command (e.g. "Mod+S"). */
      keys: Hotkey | string;
      command?: never;
    }
);

/**
 * Renders a keyboard shortcut as platform-aware `<Kbd>` tokens. Pass `command`
 * to render the user's current binding (reactive, DB-synced) or `keys` for a
 * one-off combo. Drops straight into tooltips — `Kbd` already styles itself for
 * `data-slot="tooltip-content"`.
 *
 * @example
 * Toggle sidebar <Shortcut command="toggle-sidebar" />
 * @example
 * <Shortcut keys="Mod+S" />
 */
export function Shortcut({ command, keys, className }: ShortcutProps) {
  const resolved = useResolvedKeybindings();
  const isCoarsePointer = useIsCoarsePrimaryPointer();

  // Keyboard shortcuts don't apply on touch devices — render nothing.
  if (isCoarsePointer) {
    return null;
  }

  const hotkey = command ? resolved[command] : keys;
  const tokens = formatHotkeyTokens(hotkey);
  const label = command ? getCommand(command).label : undefined;

  return (
    <KbdGroup aria-label={label} className={className}>
      {tokens.map((token, index) => (
        // Tokens can repeat (e.g. duplicate modifiers never occur, but keys may);
        // index keying is stable for a static combo string.
        // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
        <Kbd key={index}>{token}</Kbd>
      ))}
    </KbdGroup>
  );
}
