import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
import { FIELD_TYPE_DEFS } from "@/lib/databases/field-defs.ts";
import { rowPropertyToken } from "@/lib/databases/row-template.ts";
import {
  pageTitleEditorLayoutClassName,
  pageTitleIconButtonClassName,
  pageTitleIconPickerClassName,
  pageTitleIconSlotClassName,
} from "@/lib/pages/page-title-layout.ts";
import type { DatabaseField, LocalDatabase } from "@/lib/schemas/database.ts";
import type { LocalPage } from "@/lib/schemas/local-page.ts";
import { cn } from "@/lib/utils.ts";

/**
 * The row-template editor's pinned header, mirroring the anatomy of the real
 * row page so the template previews itself: an icon picker (row pages inherit
 * the template icon), a LOCKED title showing the primary-field token (title =
 * primary cell, nothing to author), and a properties reference listing every
 * other field with its type and a copy-token affordance. Fields aren't
 * editable here — rows own their values; this header teaches what a token can
 * reference.
 */

/** The inline `{{ Field }}`-styled chip used for the title and copy buttons. */
function TokenChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-md border border-primary/25 bg-primary/10 px-2 font-mono text-primary">
      {children}
    </span>
  );
}

/** One-line type summary for a field row (select types list their options). */
function fieldSummary(field: DatabaseField): string {
  const label = FIELD_TYPE_DEFS[field.type].label;
  if (
    (field.type === "select" || field.type === "multiSelect") &&
    field.options.length > 0
  ) {
    const names = field.options.map((option) => option.name);
    const shown = names.slice(0, 3).join(" / ");
    return names.length > 3 ? `${label} · ${shown} / …` : `${label} · ${shown}`;
  }
  return label;
}

function copyToken(fieldName: string): void {
  const token = rowPropertyToken(fieldName);
  navigator.clipboard
    .writeText(token)
    .then(() => toast(`Copied ${token}`))
    .catch(() => toast("Couldn't copy the token"));
}

function RowTemplatePropertyRow({ field }: { field: DatabaseField }) {
  const FieldIcon = resolveFieldIcon(field);
  const isFormula = field.type === "formula";

  return (
    <div className="flex min-h-8 items-center gap-2 text-sm">
      <div className="flex w-36 shrink-0 items-center gap-1.5 text-muted-foreground sm:w-44">
        <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
        <span className="truncate">{field.name}</span>
      </div>
      <div className="flex min-h-8 min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <span className="truncate text-muted-foreground text-xs">
          {fieldSummary(field)}
        </span>
        {isFormula ? (
          <span className="ml-auto shrink-0 text-muted-foreground/60 text-xs">
            Formulas can't be referenced yet
          </span>
        ) : (
          <button
            className="ml-auto shrink-0 rounded-md border border-primary/25 border-dashed px-2 py-0.5 font-mono text-primary text-xs transition-colors hover:bg-primary/10"
            onClick={() => {
              copyToken(field.name);
            }}
            title={`Copy ${rowPropertyToken(field.name)}`}
            type="button"
          >
            {`copy {{ ${field.name} }}`}
          </button>
        )}
      </div>
    </div>
  );
}

export interface RowTemplateTitleSectionProps {
  database: LocalDatabase;
  templatePage: LocalPage;
}

/** Locked title + properties reference for the template editor's title slot. */
export function RowTemplateTitleSection({
  database,
  templatePage,
}: RowTemplateTitleSectionProps): ReactNode {
  const { pages } = useMergedPageListItems();

  const primaryField = database.fields.find(
    (field) => field.id === database.primaryFieldId
  );
  const panelFields = useMemo(
    () =>
      database.fields.filter((field) => field.id !== database.primaryFieldId),
    [database.fields, database.primaryFieldId]
  );

  return (
    <div>
      <div className={pageTitleEditorLayoutClassName}>
        <div className={pageTitleIconSlotClassName}>
          <PageIconPicker
            className={pageTitleIconPickerClassName}
            icon={templatePage.icon}
            pageId={templatePage.id}
            pages={pages}
            previousSlug={templatePage.slug}
            title={templatePage.title}
            triggerButtonSize="icon"
            triggerClassName={pageTitleIconButtonClassName}
          />
        </div>
        <h1
          className={cn(
            "flex w-full min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1",
            headingSurfaceClassName,
            headingTypographyClassNames[1]
          )}
        >
          <TokenChip>{primaryField?.name ?? "Name"}</TokenChip>
          <span className="font-normal text-muted-foreground text-sm">
            Row title — always the primary field
          </span>
        </h1>
      </div>
      {panelFields.length > 0 ? (
        <div className="mt-6 mb-4 flex flex-col gap-0.5 border-border border-b pb-3">
          {panelFields.map((field) => (
            <RowTemplatePropertyRow field={field} key={field.id} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
