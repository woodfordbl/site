import {
  IconArrowLeft,
  IconMathFunction,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import {
  lazy,
  type ReactNode,
  // biome-ignore lint/correctness/noUnresolvedImports: React 19 exports Suspense; Biome types lag
  Suspense,
  useId,
  useMemo,
  useState,
} from "react";
import { FormulaCodeEditorBoundary } from "@/components/database/formula-editor-panel.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  createFormulaFunction,
  deleteFormulaFunction,
  formulaFunctionValidationError,
  updateFormulaFunction,
} from "@/db/queries/formula-function-ops.ts";
import { useAllDatabases } from "@/db/queries/use-database.ts";
import {
  useFormulaFunctionDefs,
  useFormulaUserFunctions,
} from "@/db/queries/use-formula-functions.ts";
import {
  type FormulaRelatedDatabase,
  formulaCheckContext,
} from "@/lib/databases/formula-values.ts";
import { type ParseFormulaResult, parseFormula } from "@/lib/formula/parse.ts";
import { canonicalizeExpression } from "@/lib/formula/ref-rewrite.ts";
import { formulaUserFunctionSignature } from "@/lib/formula/user-functions.ts";
import type { FormulaPreparedUserFunctions } from "@/lib/formula/values.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import type { LocalFormulaFunction } from "@/lib/schemas/local-formula-function.ts";

/**
 * Management UI for named user-defined formula functions (proposal §9 P5 —
 * the core shipped separately: storage, ops, language, engine). A Base UI
 * dialog listing every definition (signature + description, edit/delete per
 * row, "New function") that swaps the list for an inline create/edit form —
 * the rollup wizard's swap pattern, not a nested route. It is hosted INSIDE
 * the desktop formula dialog's content (DatabaseColumnMenu), so Base UI
 * treats it as a true nested dialog: it stacks above and Escape closes only
 * the manager, never the formula dialog beneath.
 *
 * All writes go through the ops layer
 * (`db/queries/formula-function-ops.ts`), which owns the name/param rules —
 * the form calls `formulaFunctionValidationError` for LIVE inline validation
 * and never reimplements a rule. The body edits in the shared lazy CM6
 * formula editor with an EMPTY fields list (parameters are bare names, not
 * properties; `db("…")` references still chip and complete through
 * `relatedDatabases`). Save requires a parseable, non-blank body — unlike a
 * column formula, a blank definition has no "clear the formula" meaning
 * (Delete covers removal). Known v1 wart: the checker can't see the
 * parameter bindings from outside (`src/lib/formula` is frozen), so bare
 * parameter references squiggle as unknown names in the editor; the save
 * gate is parse-only, so the squiggles never block anything.
 */

/** Same code-split as the panel: CM6 loads only when an editor opens. */
const FormulaCodeEditor = lazy(() =>
  import("@/components/database/formula-code-editor.tsx").then((module) => ({
    default: module.FormulaCodeEditor,
  }))
);

/** Definition bodies check/canonicalize against NO own-schema fields. */
const NO_FIELDS: readonly DatabaseField[] = [];

/** Comma-separated params input → the trimmed name list the ops validate. */
function parseFunctionParams(text: string): string[] {
  return text
    .split(",")
    .map((param) => param.trim())
    .filter((param) => param !== "");
}

/**
 * Minimal parse-only status line under the body editor: the first parse
 * error (1-based raw-draft position), "✓ Valid" when it parses, nothing while
 * blank. Deliberately NOT the panel's checker-aware status — parameters are
 * unbound names out here, so checker diagnostics would cry wolf.
 */
function FunctionParseStatus({
  parsed,
}: {
  parsed: ParseFormulaResult | null;
}): ReactNode {
  if (parsed === null) {
    return null;
  }
  if (!parsed.ok) {
    return (
      <span className="min-w-0 truncate text-destructive text-xs">
        {parsed.error.message} (at character {parsed.error.position + 1})
      </span>
    );
  }
  return (
    <span className="min-w-0 truncate text-muted-foreground text-xs">
      ✓ Valid
    </span>
  );
}

/**
 * Labeled column used by the form's rows. The control is render-prop'd the
 * generated id so the label associates via `htmlFor` (the a11y rule can't
 * see through a dynamic-children nesting).
 */
function FormField({
  children,
  label,
}: {
  children: (id: string) => ReactNode;
  label: string;
}): ReactNode {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label className="font-medium text-muted-foreground text-xs" htmlFor={id}>
        {label}
      </label>
      {children(id)}
    </div>
  );
}

interface FormulaFunctionFormProps {
  /** The definition being edited, or `null` to create a new one. */
  def: LocalFormulaFunction | null;
  /** Back to the list (also the post-save landing). */
  onBack: () => void;
  relatedDatabases: readonly FormulaRelatedDatabase[];
  /** Prepared registry so the body can call OTHER definitions (recursion is guarded at runtime). */
  userFunctions: FormulaPreparedUserFunctions;
}

/** Inline create/edit form the manager swaps in for its list. */
function FormulaFunctionForm({
  def,
  onBack,
  relatedDatabases,
  userFunctions,
}: FormulaFunctionFormProps): ReactNode {
  const [name, setName] = useState(def?.name ?? "");
  const [paramsText, setParamsText] = useState(def?.params.join(", ") ?? "");
  const [description, setDescription] = useState(def?.description ?? "");
  const [draft, setDraft] = useState(def?.expression ?? "");
  /** Write-time ops rejection (validation races are possible); rare. */
  const [opError, setOpError] = useState<string | null>(null);

  const params = useMemo(() => parseFunctionParams(paramsText), [paramsText]);
  const trimmedName = name.trim();
  // The ops layer's shared validator — the single source of the name/param
  // rules (catalog collisions, reserved words, duplicates, uniqueness).
  const validationError = formulaFunctionValidationError(
    trimmedName,
    params,
    def?.id
  );
  const parsed = draft.trim() === "" ? null : parseFormula(draft);
  // A definition needs a name that passes the rules AND a parseable body —
  // blank bodies stay unsaveable (Delete covers removal, unlike the panel's
  // clear-the-formula case).
  const saveDisabled =
    validationError !== null || parsed === null || !parsed.ok;
  // Blank names suppress the "can't be empty" nag while the form is fresh;
  // Save stays disabled either way.
  const inlineError = trimmedName === "" ? null : (validationError ?? opError);

  const checkContext = useMemo(
    () => formulaCheckContext(NO_FIELDS, relatedDatabases, userFunctions),
    [relatedDatabases, userFunctions]
  );

  const save = () => {
    if (saveDisabled) {
      return;
    }
    // Canonicalize typed db("Name") references to id form (idempotent; no
    // own-schema fields, so property references pass through untouched).
    const expression = canonicalizeExpression(
      draft,
      NO_FIELDS,
      relatedDatabases
    ).text;
    const trimmedDescription = description.trim();
    const result =
      def === null
        ? createFormulaFunction({
            ...(trimmedDescription === ""
              ? {}
              : { description: trimmedDescription }),
            expression,
            name: trimmedName,
            params,
          })
        : updateFormulaFunction(def.id, {
            description: trimmedDescription,
            expression,
            name: trimmedName,
            params,
          });
    if (result.ok) {
      onBack();
      return;
    }
    setOpError(result.error);
  };

  const expressionFallback = (
    <Textarea
      aria-label="Function expression"
      autoComplete="off"
      className="max-h-48 min-h-24 font-mono text-xs md:text-xs"
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      placeholder="points * weight"
      spellCheck={false}
      value={draft}
    />
  );

  return (
    <div className="flex flex-col gap-2">
      {/* Whole header is the Back control — the rollup wizard's pattern. */}
      <button
        aria-label="Back"
        className="flex h-8 w-full items-center gap-1.5 rounded-md px-1.5 text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
        onClick={onBack}
        type="button"
      >
        <IconArrowLeft className="size-4 shrink-0 stroke-[1.5px]" />
        <span className="truncate font-medium text-xs">
          {def === null ? "New function" : `Edit ${def.name}`}
        </span>
      </button>
      <div className="flex gap-2">
        <FormField label="Name">
          {(id) => (
            <Input
              autoComplete="off"
              id={id}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="weightedScore"
              spellCheck={false}
              value={name}
            />
          )}
        </FormField>
        <FormField label="Parameters">
          {(id) => (
            <Input
              autoComplete="off"
              id={id}
              onChange={(event) => {
                setParamsText(event.target.value);
              }}
              placeholder="points, weight"
              spellCheck={false}
              value={paramsText}
            />
          )}
        </FormField>
      </div>
      <FormField label="Description">
        {(id) => (
          <Input
            autoComplete="off"
            id={id}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            placeholder="What this function computes (optional)"
            value={description}
          />
        )}
      </FormField>
      <div className="flex min-w-0 flex-col gap-1">
        {/* The editing surface labels itself (aria-label on either surface),
            so this heading is visual only — not a <label>. */}
        <span className="font-medium text-muted-foreground text-xs">
          Expression
        </span>
        <FormulaCodeEditorBoundary fallback={expressionFallback}>
          <Suspense fallback={expressionFallback}>
            <FormulaCodeEditor
              ariaLabel="Function expression"
              checkContext={checkContext}
              databases={relatedDatabases}
              fields={NO_FIELDS}
              onChange={setDraft}
              onSubmit={save}
              placeholder="points * weight"
              value={draft}
            />
          </Suspense>
        </FormulaCodeEditorBoundary>
      </div>
      <div className="flex min-h-4 flex-col gap-0.5 px-0.5">
        <FunctionParseStatus parsed={parsed} />
        {inlineError === null ? null : (
          <span className="min-w-0 truncate text-destructive text-xs">
            {inlineError}
          </span>
        )}
      </div>
      <div className="flex justify-end">
        <Button disabled={saveDisabled} onClick={save} size="sm">
          Save
        </Button>
      </div>
    </div>
  );
}

interface FunctionListRowProps {
  /** Second-click arming state of the two-step delete. */
  confirmingDelete: boolean;
  def: LocalFormulaFunction;
  onDelete: () => void;
  onEdit: () => void;
}

/** One definition row: signature + description, edit, two-step delete. */
function FunctionListRow({
  confirmingDelete,
  def,
  onDelete,
  onEdit,
}: FunctionListRowProps): ReactNode {
  return (
    <div className="flex min-h-9 items-center gap-2 rounded-md px-1.5 py-1">
      <IconMathFunction className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-mono text-xs">
          {formulaUserFunctionSignature(def)}
        </span>
        {def.description ? (
          <span className="truncate text-muted-foreground text-xs">
            {def.description}
          </span>
        ) : null}
      </div>
      <Button
        aria-label={`Edit ${def.name}`}
        className="text-muted-foreground hover:text-foreground"
        onClick={onEdit}
        size="icon-xs"
        variant="ghost"
      >
        <IconPencil />
      </Button>
      {confirmingDelete ? (
        <Button
          aria-label={`Confirm delete ${def.name}`}
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
          size="xs"
          variant="ghost"
        >
          Confirm delete…
        </Button>
      ) : (
        <Button
          aria-label={`Delete ${def.name}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          size="icon-xs"
          variant="ghost"
        >
          <IconTrash />
        </Button>
      )}
    </div>
  );
}

interface FormulaFunctionListProps {
  defs: readonly LocalFormulaFunction[];
  onCreate: () => void;
  onEdit: (def: LocalFormulaFunction) => void;
}

/** The manager's list view: every definition plus the New function button. */
function FormulaFunctionList({
  defs,
  onCreate,
  onEdit,
}: FormulaFunctionListProps): ReactNode {
  // Two-step destructive delete (the Delete-database pattern): first press
  // arms one row, the second press on that row deletes. Pressing another
  // row's delete re-arms there instead.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null
  );
  return (
    <div className="flex flex-col gap-2">
      {defs.length === 0 ? (
        <div className="rounded-md border border-border px-3 py-6 text-center text-muted-foreground text-xs">
          No custom functions yet. Define one and call it from any formula in
          this workspace.
        </div>
      ) : (
        <ScrollArea className="max-h-80 overflow-hidden rounded-md border border-border">
          <div className="flex flex-col p-1">
            {defs.map((def) => (
              <FunctionListRow
                confirmingDelete={confirmingDeleteId === def.id}
                def={def}
                key={def.id}
                onDelete={() => {
                  if (confirmingDeleteId === def.id) {
                    deleteFormulaFunction(def.id);
                    setConfirmingDeleteId(null);
                    return;
                  }
                  setConfirmingDeleteId(def.id);
                }}
                onEdit={() => {
                  onEdit(def);
                }}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      <div className="flex justify-end">
        <Button onClick={onCreate} variant="outline">
          <IconPlus />
          New function
        </Button>
      </div>
    </div>
  );
}

/** The manager's view state: the list, or the form over one definition. */
type ManagerMode =
  | { view: "list" }
  | { def: LocalFormulaFunction | null; view: "form" };

/**
 * Dialog body: live definitions + editor context via hooks (mounted only
 * while the dialog is open — Base UI unmounts closed popups, so the live
 * queries cost nothing per column header), list ↔ form swap.
 */
function FormulaFunctionManager(): ReactNode {
  const defs = useFormulaFunctionDefs();
  const relatedDatabases = useAllDatabases();
  const userFunctions = useFormulaUserFunctions();
  const [mode, setMode] = useState<ManagerMode>({ view: "list" });
  // Name-sorted for a stable listing (the live query is unordered).
  const sortedDefs = useMemo(
    () => [...defs].sort((a, b) => a.name.localeCompare(b.name)),
    [defs]
  );
  if (mode.view === "form") {
    return (
      <FormulaFunctionForm
        def={mode.def}
        onBack={() => {
          setMode({ view: "list" });
        }}
        relatedDatabases={relatedDatabases}
        userFunctions={userFunctions}
      />
    );
  }
  return (
    <FormulaFunctionList
      defs={sortedDefs}
      onCreate={() => {
        setMode({ def: null, view: "form" });
      }}
      onEdit={(def) => {
        setMode({ def, view: "form" });
      }}
    />
  );
}

export interface FormulaFunctionManagerDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * The manager dialog (see module docs). Render INSIDE another dialog's
 * content to stack as a Base UI nested dialog — the formula dialog host does.
 */
export function FormulaFunctionManagerDialog({
  onOpenChange,
  open,
}: FormulaFunctionManagerDialogProps): ReactNode {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Custom functions</DialogTitle>
        </DialogHeader>
        <FormulaFunctionManager />
      </DialogContent>
    </Dialog>
  );
}
