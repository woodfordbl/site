import {
  IconCheck,
  IconChevronRight,
  IconReplace,
  IconTrash,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import type { FormulaChipTap } from "@/components/database/formula-code-editor.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { useHaptics } from "@/hooks/haptics.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Option menu for a tapped property chip in the CM6 formula editor (proposal
 * §7: "chip tap = menu, not caret gymnastics"): **Change property** swaps the
 * reference in place (a submenu-style property list with the field-type
 * icons), **Remove** deletes the whole canonical span. The host owns the
 * splices — this component only reports which action was picked.
 *
 * Built on the ui Popover with an imperative `anchor` (the chip's DOM node
 * from {@link FormulaChipTap}) and plain buttons rather than DropdownMenu,
 * because the panel's hosts differ: the wide layout lives inside a Base UI
 * Dialog, but the stack layout lives inside a Base UI MENU popup where nested
 * Base UI menus are not allowed — the same constraint that shaped the rollup
 * wizard's plain-button design. A popover works in all three hosts, and on
 * coarse pointers (the mobile sheet) the ui Popover renders as a vaul bottom
 * drawer (`variant="menu"`) automatically — the same presentation as the
 * accessory row's picker drawers — with the anchor simply unused there.
 *
 * The chip-tap type import is type-only on purpose: this module is imported
 * by the panel eagerly, and a value import would drag the lazy-loaded CM6
 * chunk into the main bundle.
 */

/** Shared row look for the plain-button menu items (touch-sized on coarse). */
const chipMenuRowClassName =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none pointer-coarse:min-h-10 hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground";

const chipMenuIconClassName =
  "size-4 shrink-0 stroke-[1.5px] text-muted-foreground";

/**
 * Mount-focus ref for each mode's first row (module-level so the callback
 * identity is stable and never re-runs on re-render). The editor keeps focus
 * through the chip tap (the press is swallowed), so without this Escape
 * would target the editor and bubble on to close the HOST dialog/menu —
 * focused inside the popup, Escape closes just the chip menu, and the
 * options become keyboard-reachable. Deferred a tick because the popup
 * mounts before Base UI finishes positioning/revealing it (focusing a
 * not-yet-displayed node is a silent no-op); a zero timeout rather than rAF
 * so the focus also lands in hidden documents, where rAF never fires.
 */
function focusOnMount(node: HTMLButtonElement | null): void {
  if (node === null) {
    return;
  }
  setTimeout(() => {
    node.focus();
  }, 0);
}

/** The two-option root: Change property (expands) and Remove (destructive). */
function ChipMenuOptions({
  onChangeProperty,
  onRemove,
}: {
  onChangeProperty: () => void;
  onRemove: () => void;
}): ReactNode {
  const haptic = useHaptics();
  return (
    <div className="flex flex-col">
      <button
        className={chipMenuRowClassName}
        onClick={() => {
          haptic("selection");
          onChangeProperty();
        }}
        ref={focusOnMount}
        type="button"
      >
        <IconReplace className={chipMenuIconClassName} />
        <span className="min-w-0 flex-1 truncate">Change property</span>
        <IconChevronRight className={chipMenuIconClassName} />
      </button>
      <button
        className={cn(
          chipMenuRowClassName,
          "text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
        )}
        onClick={() => {
          haptic("selection");
          onRemove();
        }}
        type="button"
      >
        <IconTrash className="size-4 shrink-0 stroke-[1.5px]" />
        Remove
      </button>
    </div>
  );
}

/**
 * The Change-property list: every schema field with its type/custom icon,
 * the currently referenced one check-marked. Picking a field reports it up
 * (the host splices the canonical reference over the chip's span).
 */
function ChipMenuPropertyList({
  currentFieldId,
  fields,
  onPick,
}: {
  currentFieldId: string | undefined;
  fields: readonly DatabaseField[];
  onPick: (field: DatabaseField) => void;
}): ReactNode {
  const haptic = useHaptics();
  return (
    <div className="flex max-h-64 flex-col overflow-y-auto">
      <div className="px-2 pt-1 pb-1 font-medium text-muted-foreground text-xs">
        Change property to
      </div>
      {fields.map((field, index) => {
        const FieldIcon = resolveFieldIcon(field);
        return (
          <button
            className={chipMenuRowClassName}
            key={field.id}
            onClick={() => {
              haptic("selection");
              onPick(field);
            }}
            ref={index === 0 ? focusOnMount : undefined}
            type="button"
          >
            <FieldIcon className={chipMenuIconClassName} />
            <span className="min-w-0 flex-1 truncate">{field.name}</span>
            {field.id === currentFieldId ? (
              <IconCheck className={chipMenuIconClassName} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface FormulaChipMenuProps {
  /** Live schema — feeds the Change-property list. */
  fields: readonly DatabaseField[];
  /**
   * Escape/outside-click dismissal without an action. The host clears the
   * tap and hands focus back to the editor.
   */
  onClose: () => void;
  /**
   * Change property: swap the tapped reference to this field. The host
   * splices `canonicalPropertyReference(field.id)` over the tap's span.
   */
  onPickProperty: (field: DatabaseField) => void;
  /** Remove: delete the tap's whole canonical span. */
  onRemove: () => void;
  /** The active chip tap; `null` renders the menu closed. */
  tap: FormulaChipTap | null;
}

/** The chip option menu (see module docs). */
export function FormulaChipMenu({
  fields,
  onClose,
  onPickProperty,
  onRemove,
  tap,
}: FormulaChipMenuProps): ReactNode {
  const [mode, setMode] = useState<"options" | "properties">("options");

  // Every new tap opens at the two-option root — a previous tap may have
  // been dismissed with the property list showing. Render-phase reset (the
  // React derived-state pattern) rather than an effect: the menu must never
  // paint the stale list for a frame.
  const [lastTap, setLastTap] = useState(tap);
  if (tap !== lastTap) {
    setLastTap(tap);
    setMode("options");
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open={tap !== null}
    >
      <PopoverContent
        align="start"
        anchor={tap?.anchor ?? null}
        className="w-56 gap-0 p-1"
        side="bottom"
      >
        {mode === "options" ? (
          <ChipMenuOptions
            onChangeProperty={() => {
              setMode("properties");
            }}
            onRemove={onRemove}
          />
        ) : (
          <ChipMenuPropertyList
            currentFieldId={tap?.fieldId}
            fields={fields}
            onPick={onPickProperty}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
