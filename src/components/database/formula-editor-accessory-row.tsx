import {
  IconMathFunction,
  IconSearch,
  IconVariable,
} from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { Button } from "@/components/ui/button.tsx";
import { ButtonGroup } from "@/components/ui/button-group.tsx";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useHaptics } from "@/hooks/haptics.ts";
import { useKeyboardToolbarAnchor } from "@/hooks/use-visual-viewport-keyboard.ts";
import {
  FORMULA_FUNCTION_CATALOG,
  type FormulaFunctionEntry,
  formulaFunctionSignature,
} from "@/lib/formula/catalog.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Keyboard accessory row for the mobile formula sheet (proposal §7, the
 * Numbers-style operator row): pinned above the on-screen keyboard via
 * {@link useKeyboardToolbarAnchor} (portaled to `document.body` so
 * `position: fixed` is viewport-relative, composited transform on iOS — same
 * machinery as the canvas `MobileEditorToolbar`). Two leading buttons open
 * bottom-drawer pickers — a property picker and a function browser, replacing
 * the panel's inline reference list which has no room in the sheet — followed
 * by the operator/punctuation keys formulas actually need. Insertions go
 * through the panel's caret-splice callbacks (the CM6 handle when mounted,
 * the fallback textarea's selection range otherwise), so the row works on
 * whichever surface is live. The row hides while a picker drawer is open
 * (the drawer covers the keyboard anyway) and every tap fires a selection
 * haptic.
 */

/** Operator/punctuation keys, in typing-frequency order (proposal §7). */
const OPERATOR_KEYS = [
  "(",
  ")",
  ",",
  '"',
  "+",
  "-",
  "*",
  "/",
  ".",
  "==",
] as const;

type PickerMode = "function" | "property";

/**
 * Keep typing inside the picker search from triggering the host menu/drawer
 * key handling; Escape still propagates so it can close. (Local copy of the
 * panel's `stopMenuKeys` — importing it would cycle with the panel, which
 * imports this row.)
 */
function stopMenuKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** Touch-sized row button shared by picker entries (h-10+ targets). */
const pickerRowClassName =
  "flex min-h-10 w-full cursor-default select-none items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground active:bg-selection";

/**
 * One accessory key: fires a selection haptic and runs its action without
 * stealing focus from the editor field, so the on-screen keyboard stays open
 * (same `onMouseDown` preventDefault pattern as the canvas toolbar buttons).
 */
function AccessoryKey({
  children,
  label,
  onPress,
}: {
  children: ReactNode;
  label: string;
  onPress: () => void;
}): ReactNode {
  const haptic = useHaptics();
  return (
    <Button
      aria-label={label}
      className="h-10 min-w-10 px-2.5 font-mono text-muted-foreground"
      onClick={() => {
        haptic("selection");
        onPress();
      }}
      onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
        // Keep the editor focused (don't dismiss the keyboard).
        event.preventDefault();
      }}
      type="button"
      variant="outline"
    >
      {children}
    </Button>
  );
}

/**
 * Bottom-drawer shell shared by the two pickers: `modal={false}` plus a
 * hand-rolled backdrop and `onCloseAutoFocus` preventDefault, following
 * `MobileBlockTypePicker`, so closing never yanks focus back to a trigger
 * and the formula editor can reclaim the keyboard after an insert.
 */
function PickerDrawer({
  children,
  onOpenChange,
  onQueryChange,
  open,
  query,
  searchLabel,
  title,
}: {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  open: boolean;
  query: string;
  searchLabel: string;
  title: string;
}): ReactNode {
  return (
    <>
      {typeof document === "undefined"
        ? null
        : createPortal(
            <div
              aria-hidden
              className={cn(
                "fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 supports-backdrop-filter:backdrop-blur-xs",
                open ? "opacity-100" : "pointer-events-none opacity-0"
              )}
              onClick={() => onOpenChange(false)}
            />,
            document.body
          )}
      <Drawer modal={false} onOpenChange={onOpenChange} open={open}>
        <DrawerContent
          hasTitle
          // Let the formula editor reclaim focus (and the keyboard) after an
          // insert instead of vaul restoring focus to the trigger button.
          onCloseAutoFocus={(event) => event.preventDefault()}
          variant="menu"
        >
          <DrawerHeader className="gap-2 pb-2 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <InputGroup className="h-10">
              <InputGroupAddon align="inline-start">
                <InputGroupText>
                  <IconSearch />
                </InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                aria-label={searchLabel}
                autoComplete="off"
                onChange={(event) => {
                  onQueryChange(event.target.value);
                }}
                onKeyDown={stopMenuKeys}
                placeholder="Search…"
                value={query}
              />
            </InputGroup>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1" viewportClassName="px-2 pb-4">
            {children}
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Muted empty state for a picker whose search matched nothing. */
function PickerEmpty(): ReactNode {
  return (
    <div className="px-3 py-4 text-center text-muted-foreground text-xs">
      No matches
    </div>
  );
}

/**
 * Property picker drawer: mirrors the panel reference list's Properties
 * section (every field, formulas included — formulas may reference other
 * formulas). Tap inserts through the panel's `insertPropertyReference` path
 * (canonical `prop("<id>")` on the CM6 surface) and closes the drawer.
 */
function PropertyPickerDrawer({
  fields,
  onOpenChange,
  onPick,
  open,
}: {
  fields: readonly DatabaseField[];
  onOpenChange: (open: boolean) => void;
  onPick: (field: DatabaseField) => void;
  open: boolean;
}): ReactNode {
  const haptic = useHaptics();
  const [query, setQuery] = useState("");
  const close = (next: boolean) => {
    if (!next) {
      setQuery("");
    }
    onOpenChange(next);
  };
  const normalized = query.trim().toLowerCase();
  const matches = fields.filter((field) =>
    field.name.toLowerCase().includes(normalized)
  );
  return (
    <PickerDrawer
      onOpenChange={close}
      onQueryChange={setQuery}
      open={open}
      query={query}
      searchLabel="Search properties"
      title="Insert property"
    >
      {matches.map((field) => {
        const FieldIcon = resolveFieldIcon(field);
        return (
          <button
            className={pickerRowClassName}
            key={field.id}
            onClick={() => {
              haptic("selection");
              onPick(field);
              close(false);
            }}
            type="button"
          >
            <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{field.name}</span>
          </button>
        );
      })}
      {matches.length === 0 ? <PickerEmpty /> : null}
    </PickerDrawer>
  );
}

/**
 * Function browser drawer: the catalog with signatures and descriptions,
 * filtered like the panel's reference search (name, aliases, signature,
 * category, description). Tap inserts `name()` with the caret inside the
 * parens and closes the drawer.
 */
function FunctionPickerDrawer({
  onOpenChange,
  onPick,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onPick: (entry: FormulaFunctionEntry) => void;
  open: boolean;
}): ReactNode {
  const haptic = useHaptics();
  const [query, setQuery] = useState("");
  const close = (next: boolean) => {
    if (!next) {
      setQuery("");
    }
    onOpenChange(next);
  };
  const normalized = query.trim().toLowerCase();
  const matches = FORMULA_FUNCTION_CATALOG.map((entry) => ({
    entry,
    signature: formulaFunctionSignature(entry),
  })).filter(({ entry, signature }) =>
    [
      entry.name,
      ...(entry.aliases ?? []),
      signature,
      entry.category,
      entry.description,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );
  return (
    <PickerDrawer
      onOpenChange={close}
      onQueryChange={setQuery}
      open={open}
      query={query}
      searchLabel="Search functions"
      title="Insert function"
    >
      {matches.map(({ entry, signature }) => (
        <button
          className={pickerRowClassName}
          key={entry.name}
          onClick={() => {
            haptic("selection");
            onPick(entry);
            close(false);
          }}
          type="button"
        >
          <IconMathFunction className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-mono text-xs">{signature}</span>
            <span className="line-clamp-1 text-muted-foreground text-xs">
              {entry.description}
            </span>
          </span>
        </button>
      ))}
      {matches.length === 0 ? <PickerEmpty /> : null}
    </PickerDrawer>
  );
}

export interface FormulaEditorAccessoryRowProps {
  /** Live database schema — feeds the property picker. */
  fields: readonly DatabaseField[];
  /** The panel's caret splice (CM6 handle when mounted, else textarea). */
  onInsertAtCaret: (text: string, caretOffset: number) => void;
  /** The panel's per-surface property insertion (canonical on CM6). */
  onInsertProperty: (field: DatabaseField) => void;
}

/** The keyboard accessory row + its two picker drawers (see module docs). */
export function FormulaEditorAccessoryRow({
  fields,
  onInsertAtCaret,
  onInsertProperty,
}: FormulaEditorAccessoryRowProps): ReactNode {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const visible = pickerMode === null;
  useKeyboardToolbarAnchor(anchorRef, visible);

  const openPicker = (mode: PickerMode) => {
    // Blur the editor so the on-screen keyboard hides behind the picker
    // drawer; the insert path refocuses (CM6 `insertText` focuses the view,
    // the textarea path restores its selection range).
    const active = document.activeElement;
    if (active instanceof HTMLElement) {
      active.blur();
    }
    setPickerMode(mode);
  };

  if (typeof document === "undefined") {
    return null;
  }

  return (
    <>
      {createPortal(
        <div
          aria-hidden={!visible}
          className={cn(
            // Same compositor-layer setup as the canvas mobile toolbar: the
            // keyboard anchor drives a per-frame transform, so the layer must
            // be promoted up front and only opacity ever transitions.
            "backface-hidden fixed inset-x-0 top-0 z-50 flex items-center gap-2 px-3 transition-opacity duration-150 will-change-transform",
            visible ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          ref={anchorRef}
          role="toolbar"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
            <ButtonGroup className="shrink-0">
              <AccessoryKey
                label="Insert property"
                onPress={() => {
                  openPicker("property");
                }}
              >
                <IconVariable aria-hidden />
              </AccessoryKey>
              <AccessoryKey
                label="Insert function"
                onPress={() => {
                  openPicker("function");
                }}
              >
                <IconMathFunction aria-hidden />
                fn
              </AccessoryKey>
            </ButtonGroup>
            <ButtonGroup className="shrink-0">
              {OPERATOR_KEYS.map((key) => (
                <AccessoryKey
                  key={key}
                  label={`Insert ${key}`}
                  onPress={() => {
                    onInsertAtCaret(key, key.length);
                  }}
                >
                  {key}
                </AccessoryKey>
              ))}
            </ButtonGroup>
          </div>
        </div>,
        document.body
      )}
      <PropertyPickerDrawer
        fields={fields}
        onOpenChange={(open) => {
          setPickerMode(open ? "property" : null);
        }}
        onPick={onInsertProperty}
        open={pickerMode === "property"}
      />
      <FunctionPickerDrawer
        onOpenChange={(open) => {
          setPickerMode(open ? "function" : null);
        }}
        onPick={(entry) => {
          onInsertAtCaret(`${entry.name}()`, entry.name.length + 1);
        }}
        open={pickerMode === "function"}
      />
    </>
  );
}
