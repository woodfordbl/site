import {
  IconAlertTriangle,
  IconMathFunction,
  IconSearch,
} from "@tabler/icons-react";
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
import {
  type CaretContext,
  formulaCaretContext,
  isMethodOf,
} from "@/lib/expr/autocomplete.ts";
import { evaluateExpression } from "@/lib/expr/evaluate.ts";
import { exprValueToDisplay } from "@/lib/expr/format-result.ts";
import {
  EXPR_FUNCTION_CATALOG,
  EXPR_OPERATOR_CATALOG,
  type ExprFunctionCatalogEntry,
  type ExprOperatorCatalogEntry,
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

/**
 * Shared formula BUILDER panel (Notion-style): an expression textarea with live
 * parse status + result type and a first-row preview on top, then a single
 * searchable, scrollable autocomplete of Properties / Functions / Operators.
 * Each row carries its own title, signature, and description inline (no
 * separate detail strip), and inserts at the caret when tapped. The panel fills
 * its container's height so the reference list grows into the available space
 * (the desktop submenu gives it an XL 3:2 footprint; the mobile drawer the whole
 * sheet) with no dead space. Save hands the draft to `onSave` unconditionally.
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

/** Which reference sections to show for the caret context. */
interface Suggestions {
  functions: readonly ExprFunctionCatalogEntry[];
  methodEntries: readonly ExprFunctionCatalogEntry[];
  operators: readonly ExprOperatorCatalogEntry[];
  properties: readonly DatabaseField[];
}

/**
 * Pick the reference sections for the caret context: methods of the receiver
 * type after a value's dot, fields after a `Page.` dot, or the full catalog
 * otherwise. `partial` (the text typed after the dot) filters the suggestions.
 */
function computeSuggestions(
  context: CaretContext,
  receiverType: ExprType,
  propertyFields: readonly DatabaseField[],
  functionEntries: readonly ExprFunctionCatalogEntry[],
  operatorEntries: readonly ExprOperatorCatalogEntry[]
): Suggestions {
  const empty = {
    functions: [],
    methodEntries: [],
    operators: [],
    properties: [],
  };
  if (context.kind === "method") {
    const partial = context.partial.toLowerCase();
    return {
      ...empty,
      methodEntries: EXPR_FUNCTION_CATALOG.filter(
        (entry) =>
          isMethodOf(entry.name, receiverType) &&
          entry.name.toLowerCase().startsWith(partial)
      ),
    };
  }
  if (context.kind === "property") {
    const partial = context.partial.toLowerCase();
    return {
      ...empty,
      properties: propertyFields.filter((field) =>
        field.name.toLowerCase().startsWith(partial)
      ),
    };
  }
  return {
    methodEntries: [],
    properties: propertyFields,
    functions: functionEntries,
    operators: operatorEntries,
  };
}

/** All derived autocomplete state for the panel (keeps the component lean). */
function useReferenceSuggestions(
  draft: string,
  caret: number,
  query: string,
  fields: readonly DatabaseField[]
) {
  const parsed = draft.trim() === "" ? null : parseExpression(draft);
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

  const resolveType = useMemo(() => {
    const byName = new Map<string, ExprType>();
    for (const field of fields) {
      byName.set(field.name.trim().toLowerCase(), fieldExprType(field.type));
    }
    return (name: string): ExprType =>
      byName.get(name.trim().toLowerCase()) ?? "unknown";
  }, [fields]);

  const resultType: ExprType | null = parsed?.ok
    ? inferType(parsed.ast, resolveType)
    : null;

  // Ignored while searching so the search box always reaches the full catalog.
  const context: CaretContext =
    normalizedQuery === ""
      ? formulaCaretContext(draft, caret)
      : { kind: "none" };

  let receiverType: ExprType = "unknown";
  if (context.kind === "method") {
    const parsedReceiver = parseExpression(context.receiver);
    receiverType = parsedReceiver.ok
      ? inferType(parsedReceiver.ast, resolveType)
      : "unknown";
  }

  const suggestions = computeSuggestions(
    context,
    receiverType,
    propertyFields,
    functionEntries,
    operatorEntries
  );
  const nothingMatches =
    suggestions.methodEntries.length === 0 &&
    suggestions.properties.length === 0 &&
    suggestions.functions.length === 0 &&
    suggestions.operators.length === 0;

  return {
    context,
    nothingMatches,
    parsed,
    receiverType,
    resultType,
    suggestions,
  };
}

/**
 * Live parse status: `✓ Valid · type` when the draft parses, otherwise a quiet
 * warning triangle that reveals the message on hover (title) or tap (inline).
 */
function FormulaStatus({
  parsed,
  resultType,
}: {
  parsed: ReturnType<typeof parseExpression> | null;
  resultType: ExprType | null;
}) {
  const [open, setOpen] = useState(false);
  if (parsed === null) {
    return null;
  }
  if (parsed.ok) {
    return (
      <span className="px-0.5 text-muted-foreground text-xs">
        ✓ Valid
        {resultType && resultType !== "unknown" ? ` · ${resultType}` : ""}
      </span>
    );
  }
  const message = `${parsed.error.message} (at character ${parsed.error.position + 1})`;
  return (
    <button
      aria-label={message}
      className="flex items-center gap-1 self-start rounded px-0.5 text-destructive text-xs outline-none focus-visible:bg-accent"
      onClick={() => {
        setOpen((value) => !value);
      }}
      title={message}
      type="button"
    >
      <IconAlertTriangle className="size-3.5 shrink-0 stroke-[1.5px]" />
      {open ? <span className="text-left">{message}</span> : null}
    </button>
  );
}

interface ReferenceListProps {
  methods: readonly ExprFunctionCatalogEntry[];
  nothingMatches: boolean;
  onFunction: (entry: ExprFunctionCatalogEntry) => void;
  onMethod: (entry: ExprFunctionCatalogEntry) => void;
  onOperator: (entry: ExprOperatorCatalogEntry) => void;
  onProperty: (field: DatabaseField) => void;
  operators: readonly ExprOperatorCatalogEntry[];
  properties: readonly DatabaseField[];
  receiverType: ExprType;
  standaloneFunctions: readonly ExprFunctionCatalogEntry[];
}

/** Scrollable, sectioned autocomplete list — methods, properties, functions, operators. */
function ReferenceList({
  methods,
  nothingMatches,
  onFunction,
  onMethod,
  onOperator,
  onProperty,
  operators,
  properties,
  receiverType,
  standaloneFunctions,
}: ReferenceListProps) {
  return (
    <div className="flex flex-col p-1">
      {methods.length > 0 ? (
        <SectionLabel>
          {receiverType === "unknown" ? "Methods" : `${receiverType} methods`}
        </SectionLabel>
      ) : null}
      {methods.map((entry) => (
        <ReferenceRow
          description={entry.description}
          hint={entry.signature.slice(entry.name.length)}
          icon={<IconMathFunction />}
          key={`method-${entry.name}`}
          label={entry.name}
          onInsert={() => onMethod(entry)}
        />
      ))}
      {properties.length > 0 ? <SectionLabel>Properties</SectionLabel> : null}
      {properties.map((field) => {
        const FieldIcon = resolveFieldIcon(field);
        return (
          <ReferenceRow
            description={`Inserts ${formulaPropertyReference(field.name)}`}
            hint={`· ${field.type}`}
            icon={<FieldIcon />}
            key={field.id}
            label={field.name}
            onInsert={() => onProperty(field)}
          />
        );
      })}
      {standaloneFunctions.length > 0 ? (
        <SectionLabel>Functions</SectionLabel>
      ) : null}
      {standaloneFunctions.map((entry) => (
        <ReferenceRow
          description={entry.description}
          hint={entry.signature.slice(entry.name.length)}
          icon={<IconMathFunction />}
          key={entry.name}
          label={entry.name}
          onInsert={() => onFunction(entry)}
        />
      ))}
      {operators.length > 0 ? <SectionLabel>Operators</SectionLabel> : null}
      {operators.map((entry) => (
        <ReferenceRow
          description={entry.description}
          icon={
            <span className="text-center font-mono text-xs">
              {entry.symbol}
            </span>
          }
          key={entry.symbol}
          label={entry.symbol}
          onInsert={() => onOperator(entry)}
        />
      ))}
      {nothingMatches ? (
        <div className="px-2 py-3 text-center text-muted-foreground text-xs">
          No matches
        </div>
      ) : null}
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
  const [caret, setCaret] = useState(expression.length);
  const fieldRef = useRef<FormulaCodeFieldHandle>(null);

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

  /**
   * Replace source `[start, end)` with `text` and keep our tracked caret in
   * sync (programmatic edits don't fire the field's caret events).
   */
  const applyEdit = (
    start: number,
    end: number,
    text: string,
    caretOffset: number
  ) => {
    fieldRef.current?.replaceRange(start, end, text, caretOffset);
    setCaret(start + caretOffset);
  };

  const {
    context,
    nothingMatches,
    parsed,
    receiverType,
    resultType,
    suggestions,
  } = useReferenceSuggestions(draft, caret, query, fields);

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

  /** Insert a property reference, replacing a `Page.<partial>` when in context. */
  const insertProperty = (name: string) => {
    const reference = formulaPropertyReference(name);
    const start = context.kind === "property" ? context.replaceFrom : caret;
    applyEdit(start, caret, reference, reference.length);
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1.5 p-1">
      <FormulaCodeField
        ariaLabel="Formula expression"
        // Normal app input sizing: 16px on mobile (matches the base input and
        // keeps iOS from zooming on focus), 14px on desktop.
        className="max-h-40 overflow-y-auto"
        fields={fields}
        handleRef={fieldRef}
        onCaretChange={setCaret}
        onChange={setDraft}
        onKeyDown={stopMenuKeys}
        placeholder="Page.Price * 1.1"
        value={draft}
      />
      <FormulaStatus parsed={parsed} resultType={resultType} />
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
      <ScrollArea className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        <ReferenceList
          methods={suggestions.methodEntries}
          nothingMatches={nothingMatches}
          onFunction={(entry) => {
            // Caret lands inside the parens, ready for arguments.
            applyEdit(caret, caret, `${entry.name}()`, entry.name.length + 1);
          }}
          onMethod={(entry) => {
            if (context.kind === "method") {
              // Replace the typed partial after the dot with `name()`.
              applyEdit(
                context.replaceFrom,
                caret,
                `${entry.name}()`,
                entry.name.length + 1
              );
            }
          }}
          onOperator={(entry) => {
            applyEdit(
              caret,
              caret,
              ` ${entry.symbol} `,
              entry.symbol.length + 2
            );
          }}
          onProperty={(field) => {
            insertProperty(field.name);
          }}
          operators={suggestions.operators}
          properties={suggestions.properties}
          receiverType={receiverType}
          standaloneFunctions={suggestions.functions}
        />
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
