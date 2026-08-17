/**
 * @fileoverview The formula studio: the full-screen mobile editing surface's
 * reference tray and column layout.
 *
 * Split out of `formula-editor-panel.tsx` so each file stays inside the
 * repository's length cap; the panel owns state and insertion, this module
 * owns how the studio's lower half looks and what a row tap inserts.
 */
import {
  IconChevronDown,
  IconMathFunction,
  IconSearch,
  IconSum,
} from "@tabler/icons-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import type { FormulaFunctionEntry } from "@/lib/formula/catalog.ts";
import type { FormulaOperatorCatalogEntry } from "@/lib/formula/operator-catalog.ts";
import type { FormulaPreparedUserFunction } from "@/lib/formula/values.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Keep typing inside menu-embedded controls from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 * Defined locally rather than imported from the panel — that import would
 * cycle, which is why every menu-hosted control in this directory keeps its
 * own copy.
 */
function stopMenuKeys(event: KeyboardEvent<Element>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** Everything the reference surfaces can offer, already filtered by search. */
export interface ReferenceListEntries {
  customFunctionEntries: (FormulaPreparedUserFunction & {
    signature: string;
  })[];
  functionEntries: (FormulaFunctionEntry & { signature: string })[];
  operatorEntries: FormulaOperatorCatalogEntry[];
  propertyFields: DatabaseField[];
}

type StudioTrayTab = "functions" | "operators" | "properties";

const STUDIO_TABS: readonly { key: StudioTrayTab; label: string }[] = [
  { key: "properties", label: "Properties" },
  { key: "functions", label: "Functions" },
  { key: "operators", label: "Operators" },
];

/** Shared row chrome for the studio tray lists (44px touch targets). */
const studioRowClassName =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none pointer-coarse:min-h-11 hover:bg-accent hover:text-accent-foreground";

/**
 * The studio's bottom half: a segmented Properties / Functions / Operators
 * browser with search — the desktop reference list reborn as a tall,
 * touch-first tray that occupies the space the keyboard takes while typing.
 * Function rows expand in place (chevron) to show the description and a
 * runnable example BEFORE inserting; row taps insert at the caret through
 * the same paths every other surface uses.
 */
export function StudioTray({
  entries,
  onInsertAtCaret,
  onInsertCustomFunction,
  onInsertFunction,
  onInsertProperty,
  onOpenRollup,
  onQueryChange,
  query,
  rollupAvailable,
}: {
  entries: ReferenceListEntries;
  onInsertAtCaret: (text: string, caretOffset: number) => void;
  onInsertCustomFunction: (def: FormulaPreparedUserFunction) => void;
  onInsertFunction: (entry: FormulaFunctionEntry) => void;
  onInsertProperty: (propertyField: DatabaseField) => void;
  onOpenRollup: () => void;
  onQueryChange: (query: string) => void;
  query: string;
  rollupAvailable: boolean;
}): ReactNode {
  const [tab, setTab] = useState<StudioTrayTab>("properties");
  /** Which function row's docs are expanded; keyed by (custom?)+name. */
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const {
    customFunctionEntries,
    functionEntries,
    operatorEntries,
    propertyFields,
  } = entries;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {/* The app-wide tabs (indicator variant, same as the view switcher) —
            not a bespoke segmented control. */}
        <Tabs
          className="min-w-0 flex-1"
          onValueChange={(value) => {
            setTab(value as StudioTrayTab);
          }}
          value={tab}
        >
          <TabsList className="pointer-coarse:h-9 w-full" variant="indicator">
            {STUDIO_TABS.map((candidate) => (
              <TabsTrigger key={candidate.key} value={candidate.key}>
                {candidate.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {rollupAvailable ? (
          <Button
            className="pointer-coarse:h-9 shrink-0"
            onClick={onOpenRollup}
            variant="outline"
          >
            <IconSum />
            Rollup
          </Button>
        ) : null}
      </div>
      <InputGroup className="h-9 shrink-0">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label={`Search ${tab}`}
          autoComplete="off"
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
          onKeyDown={stopMenuKeys}
          placeholder={`Search ${tab}…`}
          value={query}
        />
      </InputGroup>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-col">
          {tab === "properties"
            ? propertyFields.map((propertyField) => {
                const FieldIcon = resolveFieldIcon(propertyField);
                return (
                  <button
                    className={studioRowClassName}
                    key={propertyField.id}
                    onClick={() => {
                      onInsertProperty(propertyField);
                    }}
                    type="button"
                  >
                    <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {propertyField.name}
                    </span>
                    <span className="shrink-0 text-muted-foreground text-xs">
                      {propertyField.type}
                    </span>
                  </button>
                );
              })
            : null}
          {tab === "functions" ? (
            <>
              {functionEntries.map((entry) => (
                <StudioFunctionRow
                  description={entry.description}
                  example={entry.examples[0]}
                  expanded={expandedKey === entry.name}
                  key={entry.name}
                  name={entry.name}
                  onInsert={() => {
                    onInsertFunction(entry);
                  }}
                  onToggleExpanded={() => {
                    setExpandedKey((current) =>
                      current === entry.name ? null : entry.name
                    );
                  }}
                  signature={entry.signature}
                />
              ))}
              {customFunctionEntries.map((def) => (
                <StudioFunctionRow
                  description={def.description ?? "Custom function."}
                  expanded={expandedKey === `custom:${def.name}`}
                  key={`custom:${def.name}`}
                  name={def.name}
                  onInsert={() => {
                    onInsertCustomFunction(def);
                  }}
                  onToggleExpanded={() => {
                    setExpandedKey((current) =>
                      current === `custom:${def.name}`
                        ? null
                        : `custom:${def.name}`
                    );
                  }}
                  signature={def.signature}
                />
              ))}
            </>
          ) : null}
          {tab === "operators"
            ? operatorEntries.map((entry) => (
                <button
                  className={studioRowClassName}
                  key={entry.symbol}
                  onClick={() => {
                    // Same insert shape as the desktop reference list: the
                    // operator with breathing room, caret after it.
                    onInsertAtCaret(
                      ` ${entry.symbol} `,
                      entry.symbol.length + 2
                    );
                  }}
                  type="button"
                >
                  <span className="w-8 shrink-0 font-mono text-foreground">
                    {entry.symbol}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                    {entry.description}
                  </span>
                </button>
              ))
            : null}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * One function row in the studio tray: tap inserts (placeholder snippet on
 * CM6), the trailing chevron expands the docs in place — description plus
 * the first runnable example — so mobile finally sees what desktop's detail
 * strip shows.
 */
function StudioFunctionRow({
  description,
  example,
  expanded,
  name,
  onInsert,
  onToggleExpanded,
  signature,
}: {
  description: string;
  example?: string;
  expanded: boolean;
  name: string;
  onInsert: () => void;
  onToggleExpanded: () => void;
  signature: string;
}): ReactNode {
  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        <button
          className={cn(studioRowClassName, "flex-1")}
          onClick={onInsert}
          type="button"
        >
          <IconMathFunction className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
          <span className="shrink-0 font-medium">{name}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
            {signature.slice(name.length)}
          </span>
        </button>
        <button
          aria-expanded={expanded}
          aria-label={`${name} details`}
          className="flex h-9 pointer-coarse:h-11 pointer-coarse:w-11 w-9 shrink-0 items-center justify-center text-muted-foreground"
          onClick={onToggleExpanded}
          type="button"
        >
          <IconChevronDown
            className={cn(
              "size-4 stroke-[1.5px] transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>
      {expanded ? (
        <div className="flex flex-col gap-1 px-3 pb-2.5 pl-9.5">
          <span className="text-muted-foreground text-xs">{description}</span>
          {example === undefined ? null : (
            <code className="font-mono text-foreground text-xs">{example}</code>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Arranges the full-screen studio's slots in one column: header (Cancel /
 * column name / Done), the roomy editor, the status line + preview (the same
 * plain red-text diagnostics the desktop layouts show — no boxed rows, no
 * validity pill), then the reference tray filling everything below (the open
 * rollup wizard swaps in for the tray). The bottom padding clears the
 * keyboard-anchored accessory row parked at the viewport bottom.
 */
export function StudioLayout({
  editor,
  header,
  preview,
  status,
  tray,
  wizard,
}: {
  editor: ReactNode;
  header: ReactNode;
  preview: ReactNode;
  status: ReactNode;
  tray: ReactNode;
  /** The open rollup wizard; non-null, it replaces the tray slot. */
  wizard: ReactNode | null;
}): ReactNode {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2 p-1 pb-14">
      {header}
      {editor}
      {status}
      {preview}
      {wizard ?? tray}
    </div>
  );
}
