import type { Hotkey } from "@tanstack/react-hotkeys";

import { Kbd, KbdGroup } from "@/components/ui/kbd.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { formatHotkeyTokens } from "@/lib/settings/format-hotkey.ts";
import type { CommandId } from "@/lib/settings/keyboard-commands.ts";
import {
  getCommand,
  getSequenceCommand,
  type SequenceCommandId,
} from "@/lib/settings/keyboard-commands.ts";
import { useResolvedKeybindings } from "@/lib/settings/use-keybindings.ts";
import { cn } from "@/lib/utils.ts";

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

type SequenceShortcutProps = {
  className?: string;
} & (
  | {
      /** Render a fixed char + char chord from `KEYBOARD_SEQUENCES`. */
      sequenceId: SequenceCommandId;
      sequence?: never;
    }
  | {
      /** Render an explicit char + char sequence (e.g. ["G", "H"]). */
      sequence: Hotkey[];
      sequenceId?: never;
    }
);

function SequenceThenLabel() {
  return (
    <span className="in-data-[slot=tooltip-content]:text-background/60 text-muted-foreground text-xs">
      then
    </span>
  );
}

function formatSequenceStep(step: Hotkey): string {
  return formatHotkeyTokens(step)[0] ?? String(step);
}

/**
 * Renders a fixed two-step char + char chord as `<Kbd>` **then** `<Kbd>`.
 * Use only for `KEYBOARD_SEQUENCES` — Mod/combo shortcuts use `Shortcut`.
 */
export function SequenceShortcut({
  sequenceId,
  sequence,
  className,
}: SequenceShortcutProps) {
  const isCoarsePointer = useIsCoarsePrimaryPointer();

  if (isCoarsePointer) {
    return null;
  }

  const resolved = sequenceId
    ? getSequenceCommand(sequenceId)
    : { label: undefined, sequence: sequence ?? [] };
  const steps = resolved.sequence;
  const label = resolved.label;

  const elements = steps.flatMap((step, index) => {
    const keycap = (
      // biome-ignore lint/suspicious/noArrayIndexKey: positional chord steps
      <Kbd key={`step-${index}`}>{formatSequenceStep(step)}</Kbd>
    );
    if (index === 0) {
      return [keycap];
    }
    return [
      // biome-ignore lint/suspicious/noArrayIndexKey: positional chord steps
      <SequenceThenLabel key={`then-${index}`} />,
      keycap,
    ];
  });

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="sequence-shortcut"
      {...(label ? { "aria-label": label, role: "group" } : {})}
    >
      {elements}
    </span>
  );
}

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
