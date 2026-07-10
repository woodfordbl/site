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
import { Button } from "@/components/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import { evaluateExpression } from "@/lib/expr/evaluate.ts";
import { exprValueToDisplay } from "@/lib/expr/format-result.ts";
import {
  EXPR_FUNCTION_CATALOG,
  EXPR_OPERATOR_CATALOG,
  formulaPropertyReference,
} from "@/lib/expr/function-catalog.ts";
import { parseExpression } from "@/lib/expr/parse.ts";
import {
  canonicalizeExpression,
  humanizeExpression,
} from "@/lib/expr/ref-rewrite.ts";
import { createRowScope } from "@/lib/expr/row-scope.ts";
import type {
  DatabaseCellValue,
  DatabaseField,
} from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Shared formula BUILDER panel (Notion-style): expression textarea with live
 * parse status and a first-row preview on top, then a searchable reference of
 * Properties / Functions / Operators that insert at the caret, with a
 * fixed-height detail strip documenting the focused entry. Width-fluid so it
 * works both in the desktop column-menu submenu (~360px) and full-width in
 * the mobile menu drawer. Stored expressions are field-id canonical
 * (`prop("<id>")`); the panel humanizes them into name references for the
 * draft and re-canonicalizes on Save, so users only ever see names. Save
 * hands the canonical text to the caller's `onSave` unconditionally (so the
 * menu can close); the caller compares against the stored expression and
 * skips the write for unchanged drafts.
 */

/**
 * Keep typing inside menu-embedded inputs from triggering the menu's
 * typeahead/arrow navigation; Escape still propagates so it closes the menu.
 */
function stopMenuKeys(
  event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
): void {
  if (event.key !== "Escape") {
    event.stopPropagation();
  }
}

/** Docs shown in the detail strip for the focused/last-inserted entry. */
interface ReferenceDetail {
  description: string;
  example?: string;
  title: string;
}

interface ReferenceRowProps {
  children: ReactNode;
  detail: ReferenceDetail;
  onInsert: () => void;
  onShowDetail: (detail: ReferenceDetail) => void;
}

/**
 * One tappable reference row: tap inserts (and shows its docs in the detail
 * strip); hover/focus previews the docs without inserting. ≥40px tall on
 * coarse pointers for touch.
 */
function ReferenceRow({
  children,
  detail,
  onInsert,
  onShowDetail,
}: ReferenceRowProps) {
  const coarse = useIsCoarsePrimaryPointer();
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        coarse ? "min-h-10" : "min-h-7"
      )}
      onClick={() => {
        onShowDetail(detail);
        onInsert();
      }}
      onFocus={() => {
        onShowDetail(detail);
      }}
      onPointerEnter={() => {
        onShowDetail(detail);
      }}
      type="button"
    >
      {children}
    </button>
  );
}

/** Muted section heading inside the reference list. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1.5 pt-2 pb-1 font-medium text-muted-foreground text-xs first:pt-1">
      {children}
    </div>
  );
}

export interface FormulaEditorPanelProps {
  /** Stored (canonical) expression the draft starts from, humanized on open. */
  expression: string;
  /**
   * Full database schema: non-formula fields become the Properties section,
   * and the whole list feeds the preview scope.
   */
  fields: readonly DatabaseField[];
  /** First row's cell values for the live preview; `null` when the table is empty. */
  firstRowValues: Record<string, DatabaseCellValue> | null;
  /** Called with the CANONICAL text on Save (even when unchanged — the caller decides). */
  onSave: (expression: string) => void;
}

/** The formula builder panel (see module docs). */
export function FormulaEditorPanel({
  expression,
  fields,
  firstRowValues,
  onSave,
}: FormulaEditorPanelProps): ReactNode {
  const [draft, setDraft] = useState(() =>
    humanizeExpression(expression, fields)
  );
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<ReferenceDetail | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mounted only while the (sub)menu is open — steal focus from the popup
  // after Base UI's initial focus pass (same rAF pattern as the rename input).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  /**
   * Splice `text` into the draft at the textarea's caret (replacing any
   * selection — its selectionStart/End survive blur), then restore focus with
   * the caret `caretOffset` characters into the inserted text.
   */
  const insertAtCaret = (text: string, caretOffset: number) => {
    const element = textareaRef.current;
    const start = element?.selectionStart ?? draft.length;
    const end = element?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    const caret = start + caretOffset;
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (target) {
        target.focus();
        target.setSelectionRange(caret, caret);
      }
    });
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

  const nothingMatches =
    propertyFields.length === 0 &&
    functionEntries.length === 0 &&
    operatorEntries.length === 0;

  let status: ReactNode = null;
  if (parsed !== null) {
    status = parsed.ok ? (
      <span className="px-0.5 text-muted-foreground text-xs">✓ Valid</span>
    ) : (
      <span className="px-0.5 text-destructive text-xs">
        {parsed.error.message} (at character {parsed.error.position + 1})
      </span>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1.5 p-1">
      <span className="px-0.5 font-medium text-muted-foreground text-xs">
        Formula
      </span>
      <Textarea
        aria-label="Formula expression"
        autoComplete="off"
        className="max-h-32 min-h-16 font-mono text-xs md:text-xs"
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onKeyDown={stopMenuKeys}
        placeholder="thisPage.Price * 1.1"
        ref={textareaRef}
        spellCheck={false}
        value={draft}
      />
      {status}
      {preview === null ? null : (
        <span className="truncate px-0.5 text-muted-foreground text-xs">
          Preview: {preview === "" ? "(empty)" : preview}
        </span>
      )}
      <InputGroup className="h-8">
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
      <ScrollArea className="max-h-52 overflow-hidden rounded-md border border-border">
        <div className="flex flex-col p-1">
          {propertyFields.length > 0 ? (
            <SectionLabel>Properties</SectionLabel>
          ) : null}
          {propertyFields.map((propertyField) => {
            const FieldIcon = resolveFieldIcon(propertyField);
            const reference = formulaPropertyReference(propertyField.name);
            return (
              <ReferenceRow
                detail={{
                  title: reference,
                  description: `Inserts this row's ${propertyField.name} value.`,
                  example: reference,
                }}
                key={propertyField.id}
                onInsert={() => {
                  insertAtCaret(reference, reference.length);
                }}
                onShowDetail={setDetail}
              >
                <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
                <span className="truncate">{propertyField.name}</span>
              </ReferenceRow>
            );
          })}
          {functionEntries.length > 0 ? (
            <SectionLabel>Functions</SectionLabel>
          ) : null}
          {functionEntries.map((entry) => (
            <ReferenceRow
              detail={{
                title: entry.signature,
                description: entry.description,
                example: entry.example,
              }}
              key={entry.name}
              onInsert={() => {
                // Caret lands inside the parens, ready for arguments.
                insertAtCaret(`${entry.name}()`, entry.name.length + 1);
              }}
              onShowDetail={setDetail}
            >
              <IconMathFunction className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
              <span className="shrink-0 font-mono text-xs">{entry.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {entry.signature.slice(entry.name.length)}
              </span>
            </ReferenceRow>
          ))}
          {operatorEntries.length > 0 ? (
            <SectionLabel>Operators</SectionLabel>
          ) : null}
          {operatorEntries.map((entry) => (
            <ReferenceRow
              detail={{
                title: entry.symbol,
                description: entry.description,
              }}
              key={entry.symbol}
              onInsert={() => {
                insertAtCaret(` ${entry.symbol} `, entry.symbol.length + 2);
              }}
              onShowDetail={setDetail}
            >
              <span className="w-8 shrink-0 text-center font-mono text-xs">
                {entry.symbol}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {entry.description}
              </span>
            </ReferenceRow>
          ))}
          {nothingMatches ? (
            <div className="px-1.5 py-3 text-center text-muted-foreground text-xs">
              No matches
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <div className="flex h-20 flex-col gap-0.5 overflow-hidden rounded-md border border-border px-2 py-1.5">
        {detail === null ? (
          <span className="text-muted-foreground text-xs">
            Select an item to see how it works.
          </span>
        ) : (
          <>
            <span className="truncate font-mono text-foreground text-xs">
              {detail.title}
            </span>
            <span className="line-clamp-2 text-muted-foreground text-xs">
              {detail.description}
            </span>
            {detail.example ? (
              <span className="truncate font-mono text-muted-foreground text-xs">
                {detail.example}
              </span>
            ) : null}
          </>
        )}
      </div>
      <Button
        className="self-end"
        onClick={() => {
          onSave(canonicalizeExpression(draft, fields).text);
        }}
        size="xs"
        variant="outline"
      >
        Save
      </Button>
    </div>
  );
}
