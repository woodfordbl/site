import { IconArrowLeft, IconTable } from "@tabler/icons-react";
import { type ReactNode, useState } from "react";
import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useIsCoarsePrimaryPointer } from "@/hooks/device-layout.ts";
import type { FormulaRelatedDatabase } from "@/lib/databases/formula-values.ts";
import {
  type FormulaCheckContext,
  formulaPropertyValueType,
  formulaTypeBadge,
} from "@/lib/formula/check.ts";
import { humanizeExpression } from "@/lib/formula/ref-rewrite.ts";
import {
  type FormulaRollupAggregation,
  formulaRollupAggregationsFor,
  formulaRollupExpression,
} from "@/lib/formula/rollup-template.ts";
import { type FormulaType, UNKNOWN_TYPE } from "@/lib/formula/types.ts";
import type { DatabaseField } from "@/lib/schemas/database.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Rollup template picker (proposal §4.4 tier 2) — a compact three-step
 * wizard the formula editor panel swaps in for its reference list: pick a
 * relation field, a target property (or the rows themselves), and an
 * aggregation, and the panel inserts the GENERATED formula
 * (`prop("<relId>").map(r => r.Estimate).sum()`). Rollups stay ordinary
 * formulas — one engine, one mental model; the sugar teaches the language.
 *
 * Lives inside a Base UI menu popup, so it's plain buttons only (no nested
 * menus/popovers) and adds no inputs that would need `stopMenuKeys`.
 */

/** Docs pushed into the panel's detail strip on hover/focus. */
export interface FormulaRollupDetail {
  description: string;
  example?: string;
  title: string;
}

export interface FormulaRollupWizardProps {
  /** The panel's memoized check context — types target members precisely. */
  checkContext: FormulaCheckContext;
  /** Own database schema (relation candidates + humanizing the example). */
  fields: readonly DatabaseField[];
  /** Back out of the wizard without inserting. */
  onClose: () => void;
  /** Receives the generated CANONICAL expression text. */
  onInsert: (expression: string) => void;
  /** Shows a row's docs in the panel's fixed detail strip. */
  onShowDetail: (detail: FormulaRollupDetail) => void;
  relatedDatabases: readonly FormulaRelatedDatabase[];
}

/**
 * The relation fields the wizard can build a rollup over: relation-typed AND
 * their target database resolvable. The panel gates the Rollup affordance on
 * this same rule, so the wizard never opens onto an empty step.
 */
export function formulaRollupRelationFields(
  fields: readonly DatabaseField[],
  relatedDatabases: readonly FormulaRelatedDatabase[] | undefined
): DatabaseField[] {
  if (relatedDatabases === undefined) {
    return [];
  }
  const targets = new Set(relatedDatabases.map((database) => database.id));
  return fields.filter(
    (field) => field.type === "relation" && targets.has(field.targetDatabaseId)
  );
}

/** One tappable wizard row — same look/feel as the panel's ReferenceRow. */
function WizardRow({
  children,
  detail,
  onPick,
  onShowDetail,
}: {
  children: ReactNode;
  detail: FormulaRollupDetail;
  onPick: () => void;
  onShowDetail: (detail: FormulaRollupDetail) => void;
}) {
  const coarse = useIsCoarsePrimaryPointer();
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        coarse ? "min-h-10" : "min-h-7"
      )}
      onClick={() => {
        onShowDetail(detail);
        onPick();
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

/** The picked target property, or `null` for "the rows themselves". */
interface PickedMember {
  name: string;
  type: FormulaType;
}

/** Selection state: each step fills one more slot. */
interface WizardSelection {
  member: PickedMember | null;
  /** False until step 2 picks (member stays null for "All rows"). */
  memberPicked: boolean;
  relationField: DatabaseField | null;
}

const EMPTY_SELECTION: WizardSelection = {
  member: null,
  memberPicked: false,
  relationField: null,
};

/** Step 2's property list: the target schema, typed via the check context. */
function targetMembers(
  checkContext: FormulaCheckContext,
  relatedDatabases: readonly FormulaRelatedDatabase[],
  targetDatabaseId: string
): { field: DatabaseField; type: FormulaType }[] {
  const database = relatedDatabases.find(
    (entry) => entry.id === targetDatabaseId
  );
  if (database === undefined) {
    return [];
  }
  const typed = checkContext.databases?.get(targetDatabaseId);
  return database.fields.map((field) => {
    const property = typed?.properties.find((entry) => entry.id === field.id);
    return {
      field,
      type: formulaPropertyValueType(
        property ?? { kind: field.type, type: UNKNOWN_TYPE }
      ),
    };
  });
}

/** The formula builder's rollup wizard (see module docs). */
export function FormulaRollupWizard({
  checkContext,
  fields,
  onClose,
  onInsert,
  onShowDetail,
  relatedDatabases,
}: FormulaRollupWizardProps): ReactNode {
  const [selection, setSelection] = useState<WizardSelection>(EMPTY_SELECTION);
  const { member, memberPicked, relationField } = selection;

  const back = () => {
    if (memberPicked) {
      setSelection({ ...selection, member: null, memberPicked: false });
      return;
    }
    if (relationField !== null) {
      setSelection(EMPTY_SELECTION);
      return;
    }
    onClose();
  };

  const relationCandidates = formulaRollupRelationFields(
    fields,
    relatedDatabases
  );

  let title = "Which relation?";
  if (relationField !== null) {
    title = memberPicked ? "How to roll up?" : "Which property?";
  }

  const relationStep = relationCandidates.map((field) => {
    const FieldIcon = resolveFieldIcon(field);
    const targetName =
      field.type === "relation"
        ? relatedDatabases.find(
            (database) => database.id === field.targetDatabaseId
          )?.name
        : undefined;
    return (
      <WizardRow
        detail={{
          title: field.name,
          description: `Roll up rows linked through ${field.name}.`,
        }}
        key={field.id}
        onPick={() => {
          setSelection({ ...EMPTY_SELECTION, relationField: field });
        }}
        onShowDetail={onShowDetail}
      >
        <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
        <span className="truncate">{field.name}</span>
        {targetName === undefined ? null : (
          <span className="ml-auto truncate text-muted-foreground text-xs">
            {targetName}
          </span>
        )}
      </WizardRow>
    );
  });

  const memberStep =
    relationField?.type === "relation" ? (
      <>
        <WizardRow
          detail={{
            title: "All rows",
            description: "Aggregate the linked rows themselves.",
          }}
          onPick={() => {
            setSelection({ ...selection, member: null, memberPicked: true });
          }}
          onShowDetail={onShowDetail}
        >
          <IconTable className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
          <span className="truncate">All rows</span>
        </WizardRow>
        {targetMembers(
          checkContext,
          relatedDatabases,
          relationField.targetDatabaseId
        ).map(({ field, type }) => {
          const FieldIcon = resolveFieldIcon(field);
          return (
            <WizardRow
              detail={{
                title: field.name,
                description: `Roll up each linked row's ${field.name} value.`,
              }}
              key={field.id}
              onPick={() => {
                setSelection({
                  ...selection,
                  member: { name: field.name, type },
                  memberPicked: true,
                });
              }}
              onShowDetail={onShowDetail}
            >
              <FieldIcon className="size-4 shrink-0 stroke-[1.5px] text-muted-foreground" />
              <span className="truncate">{field.name}</span>
              <span className="ml-auto shrink-0 text-muted-foreground text-xs">
                {formulaTypeBadge(type)}
              </span>
            </WizardRow>
          );
        })}
      </>
    ) : null;

  const aggregationStep =
    relationField === null
      ? null
      : formulaRollupAggregationsFor(member?.type ?? null).map((option) => {
          const generate = (aggregation: FormulaRollupAggregation) =>
            formulaRollupExpression({
              aggregation,
              memberName: member?.name ?? null,
              relationFieldId: relationField.id,
            });
          return (
            <WizardRow
              detail={{
                title: option.label,
                description: option.description,
                example: humanizeExpression(generate(option.id), fields),
              }}
              key={option.id}
              onPick={() => {
                onInsert(generate(option.id));
              }}
              onShowDetail={onShowDetail}
            >
              {/* Stacked so neither line truncates at menu/dialog widths. */}
              <span className="flex min-w-0 flex-col py-0.5">
                <span>{option.label}</span>
                <span className="text-muted-foreground text-xs">
                  {option.description}
                </span>
              </span>
            </WizardRow>
          );
        });

  let step: ReactNode = relationStep;
  if (relationField !== null) {
    step = memberPicked ? aggregationStep : memberStep;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-8 items-center gap-1 px-0.5">
        <button
          aria-label="Back"
          className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
          onClick={back}
          type="button"
        >
          <IconArrowLeft className="size-4 stroke-[1.5px]" />
        </button>
        <span className="truncate font-medium text-muted-foreground text-xs">
          Rollup: {title}
        </span>
      </div>
      <ScrollArea className="max-h-52 overflow-hidden rounded-md border border-border">
        <div className="flex flex-col p-1">{step}</div>
      </ScrollArea>
    </div>
  );
}
