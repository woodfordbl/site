import { IconMathFunction, IconSearch } from "@tabler/icons-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import {
  FormulaCodeField,
  type FormulaCodeFieldHandle,
} from "@/components/database/formula-code-field.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { evaluateExpression } from "@/lib/expr/evaluate.ts";
import { exprValueToDisplay } from "@/lib/expr/format-result.ts";
import {
  EXPR_FUNCTION_CATALOG,
  EXPR_OPERATOR_CATALOG,
  formulaPropertyReference,
} from "@/lib/expr/function-catalog.ts";
import { type ExprType, inferType } from "@/lib/expr/infer-type.ts";
import { parseExpression } from "@/lib/expr/parse.ts";
import { createRowScope } from "@/lib/expr/row-scope.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
  DatabaseFieldType,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Shared formula BUILDER panel (Notion-style): an expression textarea with live
 * parse status + result type and a first-row preview on top, then a single
 * searchable, scrollable autocomplete of Properties / Functions / Operators.
 * Each row carries its own title, signature, and description inline (no
 * separate detail strip), and inserts at the caret when tapped. Width-fluid and
 * height-fluid: in the desktop column-menu submenu (~360px) the list caps at a
 * max height; in the mobile menu drawer it grows to fill the sheet so there is
 * no dead space. Save hands the draft to the caller's `onSave` unconditionally.
 */

/** Map a database field type to the expression type its values evaluate to. */
function fieldExprType(type: DatabaseFieldType): ExprType {
  switch (type) {
    case "number":
      return "number";
    case "checkbox":
      return "boolean";
    case "date":
      return "date";
    case "text":
    case "url":
    case "select":
    case "multiSelect":
      return "text";
    default:
      // `formula` fields cannot be referenced yet (see createRowScope).
      return "unknown";
  }
}

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

interface ReferenceRowProps {
  /** One-line description shown beneath the title. */
  description?: string;
  /** Muted signature/type shown after the name on the title line. */
  hint?: string;
  icon: ReactNode;
  /** Canonical name (monospace) shown on the title line. */
  label: string;
  onInsert: () => void;
}

/**
 * One tappable autocomplete row: an icon + monospace name + muted hint on the
 * title line, with the description beneath. Tapping inserts at the caret. Tall
 * enough for a comfortable touch target on coarse pointers.
 */
function ReferenceRow({
  hint,
  icon,
  label,
  description,
  onInsert,
}: ReferenceRowProps) {
  return (
    <button
      className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:bg-accent"
      onClick={onInsert}
      type="button"
    >
      <span className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-4 [&_svg]:stroke-[1.5px]">
          {icon}
        </span>
        <span className="shrink-0 font-mono text-foreground text-sm">
          {label}
        </span>
        {hint ? (
          <span className="truncate font-mono text-muted-foreground text-xs">
            {hint}
          </span>
        ) : null}
      </span>
      {description ? (
        <span className="line-clamp-2 pl-6 text-muted-foreground text-xs">
          {description}
        </span>
      ) : null}
    </button>
  );
}

/** Muted section heading inside the reference list. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs first:pt-1">
      {children}
    </div>
  );
}

export interface FormulaEditorPanelProps {
  /** Stored expression the draft starts from (and is compared against on Save). */
  expression: string;
  /**
   * Full database schema: non-formula fields become the Properties section,
   * and the whole list feeds the preview scope.
   */
  fields: readonly DatabaseField[];
  /** First row's cell values for the live preview; `null` when the table is empty. */
  firstRowValues: Record<string, DatabaseCellValue> | null;
  /** Called with the draft on Save (even when unchanged — the caller decides). */
  onSave: (expression: string) => void;
}

/** The formula builder panel (see module docs). */
export function FormulaEditorPanel({
  expression,
  fields,
  firstRowValues,
  onSave,
}: FormulaEditorPanelProps): ReactNode {
  const [draft, setDraft] = useState(expression);
  const [query, setQuery] = useState("");
  const fieldRef = useRef<FormulaCodeFieldHandle>(null);
  const coarse = useIsCoarsePrimaryPointer();

  // Mounted only while the (sub)menu is open — steal focus from the popup
  // after Base UI's initial focus pass (same rAF pattern as the rename input).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fieldRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  /** Insert reference text at the field's caret (the field owns caret math). */
  const insertAtCaret = (text: string, caretOffset: number) => {
    fieldRef.current?.insertAtCaret(text, caretOffset);
  };

  const trimmed = draft.trim();
  const parsed = trimmed === "" ? null : parseExpression(draft);

  // Live preview against the FIRST row: evaluate the parsed draft through the
  // same scope the real overlay uses; errors render honestly ("⚠ …").
  const preview = useMemo(() => {
    if (!parsed?.ok || firstRowValues === null) {
      return null;
    }
    const scope = createRowScope([...fields], firstRowValues, {
      now: () => new Date(),
    });
    return exprValueToDisplay(evaluateExpression(parsed.ast, scope));
  }, [parsed, fields, firstRowValues]);

  const normalizedQuery = query.trim().toLowerCase();

  const propertyFields = useMemo(
    () =>
      fields.filter(
        (field) =>
          field.type !== "formula" &&
          field.name.toLowerCase().includes(normalizedQuery)
      ),
    [fields, normalizedQuery]
  );

  const functionEntries = useMemo(
    () =>
      EXPR_FUNCTION_CATALOG.filter((entry) =>
        [
          entry.name,
          ...(entry.aliases ?? []),
          entry.signature,
          entry.description,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [normalizedQuery]
  );

  const operatorEntries = useMemo(
    () =>
      EXPR_OPERATOR_CATALOG.filter((entry) =>
        `${entry.symbol} ${entry.category} ${entry.description}`
          .toLowerCase()
          .includes(normalizedQuery)
      ),
    [normalizedQuery]
  );

  // Advisory result type of the current draft, for the ✓ Valid badge. Resolves
  // property references to their field types; unknown when it can't be pinned.
  const resultType = useMemo<ExprType | null>(() => {
    if (!parsed?.ok) {
      return null;
    }
    const byName = new Map<string, ExprType>();
    for (const field of fields) {
      byName.set(field.name.trim().toLowerCase(), fieldExprType(field.type));
    }
    return inferType(
      parsed.ast,
      (name) => byName.get(name.trim().toLowerCase()) ?? "unknown"
    );
  }, [parsed, fields]);

  const nothingMatches =
    propertyFields.length === 0 &&
    functionEntries.length === 0 &&
    operatorEntries.length === 0;

  let status: ReactNode = null;
  if (parsed !== null) {
    status = parsed.ok ? (
      <span className="px-0.5 text-muted-foreground text-xs">
        ✓ Valid
        {resultType && resultType !== "unknown" ? ` · ${resultType}` : ""}
      </span>
    ) : (
      <span className="px-0.5 text-destructive text-xs">
        {parsed.error.message} (at character {parsed.error.position + 1})
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-1.5 p-1",
        // Fill the drawer sheet on touch so the autocomplete grows into the
        // space instead of leaving it dead; the popover sizes to content.
        coarse && "h-full min-h-0"
      )}
    >
      <FormulaCodeField
        ariaLabel="Formula expression"
        // Normal app input sizing: 16px on mobile (matches the base input and
        // keeps iOS from zooming on focus), 14px on desktop.
        className="max-h-40 overflow-y-auto"
        fields={fields}
        handleRef={fieldRef}
        onChange={setDraft}
        onKeyDown={stopMenuKeys}
        placeholder="thisPage.Price * 1.1"
        value={draft}
      />
      {status}
      {preview === null ? null : (
        <span className="truncate px-0.5 text-muted-foreground text-xs">
          Preview: {preview === "" ? "(empty)" : preview}
        </span>
      )}
      <InputGroup className="h-9">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <IconSearch />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Search properties, functions, and operators"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          onKeyDown={stopMenuKeys}
          placeholder="Search reference…"
          value={query}
        />
      </InputGroup>
      <ScrollArea
        className={cn(
          "overflow-hidden rounded-md border border-border",
          coarse ? "min-h-0 flex-1" : "max-h-72"
        )}
      >
        <div className="flex flex-col p-1">
          {propertyFields.length > 0 ? (
            <SectionLabel>Properties</SectionLabel>
          ) : null}
          {propertyFields.map((propertyField) => {
            const FieldIcon = resolveFieldIcon(propertyField);
            const reference = formulaPropertyReference(propertyField.name);
            return (
              <ReferenceRow
                description={`Inserts ${reference}`}
                hint={`· ${propertyField.type}`}
                icon={<FieldIcon />}
                key={propertyField.id}
                label={propertyField.name}
                onInsert={() => {
                  insertAtCaret(reference, reference.length);
                }}
              />
            );
          })}
          {functionEntries.length > 0 ? (
            <SectionLabel>Functions</SectionLabel>
          ) : null}
          {functionEntries.map((entry) => (
            <ReferenceRow
              description={entry.description}
              hint={entry.signature.slice(entry.name.length)}
              icon={<IconMathFunction />}
              key={entry.name}
              label={entry.name}
              onInsert={() => {
                // Caret lands inside the parens, ready for arguments.
                insertAtCaret(`${entry.name}()`, entry.name.length + 1);
              }}
            />
          ))}
          {operatorEntries.length > 0 ? (
            <SectionLabel>Operators</SectionLabel>
          ) : null}
          {operatorEntries.map((entry) => (
            <ReferenceRow
              description={entry.description}
              icon={
                <span className="text-center font-mono text-xs">
                  {entry.symbol}
                </span>
              }
              key={entry.symbol}
              label={entry.symbol}
              onInsert={() => {
                insertAtCaret(` ${entry.symbol} `, entry.symbol.length + 2);
              }}
            />
          ))}
          {nothingMatches ? (
            <div className="px-2 py-3 text-center text-muted-foreground text-xs">
              No matches
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <Button
        className="self-end"
        onClick={() => {
          onSave(draft);
        }}
        size="xs"
        variant="outline"
      >
        Save
      </Button>
    </div>
  );
}
