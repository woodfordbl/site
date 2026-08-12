import {
  IconCheck,
  IconChevronRight,
  IconDatabase,
  IconReplace,
  IconTrash,
} from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import type { FormulaChipTap } from "@/components/database/formula-code-editor.tsx";
import { Popover, PopoverContent } from "@/components/ui/popover.tsx";
import { useHaptics } from "@/hooks/haptics.ts";
import type { FormulaRefDatabase } from "@/lib/formula/ref-rewrite.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Option menu for a tapped reference chip in the CM6 formula editor (proposal
 * §7: "chip tap = menu, not caret gymnastics"). Property chips offer
 * **Change property** (a submenu-style property list with the field-type
 * icons); database chips — `db("…")` references — offer **Change database**
 * (the workspace databases, database glyphs); both offer **Remove**, which
 * deletes the whole canonical span. The host owns the splices — this
 * component only reports which action was picked.
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

/**
 * The two-option root: a change action (expands to the pick list — "Change
 * property" for property chips, "Change database" for db chips) and Remove
 * (destructive). `onChange` undefined (nothing to swap to — e.g. a db chip
 * with no databases wired) drops the change row and leaves Remove alone.
 */
function ChipMenuOptions({
  changeLabel,
  onChange,
  onRemove,
}: {
  changeLabel: string;
  onChange: (() => void) | undefined;
  onRemove: () => void;
}): ReactNode {
  const haptic = useHaptics();
  return (
    <div className="flex flex-col">
      {onChange === undefined ? null : (
        <button
          className={chipMenuRowClassName}
          onClick={() => {
            haptic("selection");
            onChange();
          }}
          ref={focusOnMount}
          type="button"
        >
          <IconReplace className={chipMenuIconClassName} />
          <span className="min-w-0 flex-1 truncate">{changeLabel}</span>
          <IconChevronRight className={chipMenuIconClassName} />
        </button>
      )}
      <button
        className={cn(
          chipMenuRowClassName,
          "text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive"
        )}
        onClick={() => {
          haptic("selection");
          onRemove();
        }}
        // Without a change row, Remove is the first (only) option and takes
        // the mount focus (see focusOnMount's contract).
        ref={onChange === undefined ? focusOnMount : undefined}
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

/**
 * The Change-database list — {@link ChipMenuPropertyList}'s db-chip analog:
 * every workspace database behind the database glyph, the currently
 * referenced one check-marked. Picking one reports it up (the host splices
 * the canonical `db("<id>")` reference over the chip's span).
 */
function ChipMenuDatabaseList({
  currentDatabaseId,
  databases,
  onPick,
}: {
  currentDatabaseId: string | undefined;
  databases: readonly FormulaRefDatabase[];
  onPick: (database: FormulaRefDatabase) => void;
}): ReactNode {
  const haptic = useHaptics();
  return (
    <div className="flex max-h-64 flex-col overflow-y-auto">
      <div className="px-2 pt-1 pb-1 font-medium text-muted-foreground text-xs">
        Change database to
      </div>
      {databases.map((database, index) => (
        <button
          className={chipMenuRowClassName}
          key={database.id}
          onClick={() => {
            haptic("selection");
            onPick(database);
          }}
          ref={index === 0 ? focusOnMount : undefined}
          type="button"
        >
          <IconDatabase className={chipMenuIconClassName} />
          <span className="min-w-0 flex-1 truncate">{database.name}</span>
          {database.id === currentDatabaseId ? (
            <IconCheck className={chipMenuIconClassName} />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export interface FormulaChipMenuProps {
  /**
   * Workspace databases — feeds the Change-database list for db-chip taps.
   * Omitted (or empty), a db chip's menu offers Remove only.
   */
  databases?: readonly FormulaRefDatabase[];
  /** Live schema — feeds the Change-property list. */
  fields: readonly DatabaseField[];
  /**
   * Escape/outside-click dismissal without an action. The host clears the
   * tap and hands focus back to the editor.
   */
  onClose: () => void;
  /**
   * Change database: swap the tapped db reference to this database. The
   * host splices `canonicalDatabaseReference(database.id)` over the span.
   */
  onPickDatabase?: (database: FormulaRefDatabase) => void;
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

/** The tap-kind-specific parts of the open menu (root label + pick list). */
function chipMenuContent(
  mode: "change" | "options",
  props: FormulaChipMenuProps,
  onExpand: () => void
): ReactNode {
  const { databases, fields, onPickDatabase, onPickProperty, tap } = props;
  const database = tap?.kind === "database";
  if (mode === "options") {
    const changeable = database
      ? (databases?.length ?? 0) > 0 && onPickDatabase !== undefined
      : fields.length > 0;
    return (
      <ChipMenuOptions
        changeLabel={database ? "Change database" : "Change property"}
        onChange={changeable ? onExpand : undefined}
        onRemove={props.onRemove}
      />
    );
  }
  if (database) {
    return (
      <ChipMenuDatabaseList
        currentDatabaseId={tap?.refId}
        databases={databases ?? []}
        onPick={(picked) => onPickDatabase?.(picked)}
      />
    );
  }
  return (
    <ChipMenuPropertyList
      currentFieldId={tap?.refId}
      fields={fields}
      onPick={onPickProperty}
    />
  );
}

/** The chip option menu (see module docs). */
export function FormulaChipMenu(props: FormulaChipMenuProps): ReactNode {
  const { onClose, tap } = props;
  const [mode, setMode] = useState<"change" | "options">("options");

  // Every new tap opens at the two-option root — a previous tap may have
  // been dismissed with the pick list showing. Render-phase reset (the
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
        {chipMenuContent(mode, props, () => {
          setMode("change");
        })}
      </PopoverContent>
    </Popover>
  );
}
