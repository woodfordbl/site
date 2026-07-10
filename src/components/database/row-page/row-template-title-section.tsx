import { IconCopy } from "@tabler/icons-react";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { RowDefaultValueEditor } from "@/components/database/row-page/row-default-value-editor.tsx";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
import { setDatabaseRowDefault } from "@/db/queries/database-collection-ops.ts";
import { useMergedPageListItems } from "@/hooks/use-page-list.ts";
import {
  headingSurfaceClassName,
  headingTypographyClassNames,
} from "@/lib/blocks/heading-typography.ts";
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
 * The row-template editor's pinned header, styled like a real row page: an
 * icon picker (row pages inherit the template icon), an editable DEFAULT
 * name (what "New row" titles rows; placeholder = the primary field's name),
 * and one row per non-primary field editing that field's default value
 * (`database.rowDefaults`), with a hover-revealed copy-token icon.
 */

function copyToken(fieldName: string): void {
  const token = rowPropertyToken(fieldName);
  navigator.clipboard
    .writeText(token)
    .then(() => toast(`Copied ${token}`))
    .catch(() => toast("Couldn't copy the token"));
}

function RowTemplatePropertyRow({
  database,
  field,
}: {
  database: LocalDatabase;
  field: DatabaseField;
}) {
  const FieldIcon = resolveFieldIcon(field);
  const token = rowPropertyToken(field.name);

  return (
    <div
      className="flex min-h-8 items-center justify-between gap-2 text-sm"
      data-reveal-group=""
    >
      <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
        <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
        <span className="truncate">{field.name}</span>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <RowDefaultValueEditor database={database} field={field} />
        {field.type === "formula" ? null : (
          <Button
            aria-label={`Copy ${token}`}
            className="hover-reveal shrink-0 text-muted-foreground"
            onClick={() => {
              copyToken(field.name);
            }}
            size="icon-sm"
            title={`Copy ${token}`}
            type="button"
            variant="ghost"
          >
            <IconCopy />
          </Button>
        )}
      </div>
    </div>
  );
}

export interface RowTemplateTitleSectionProps {
  database: LocalDatabase;
  templatePage: LocalPage;
}

/** Icon + default-name title + default-value rows for the editor's title slot. */
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

  const defaultName = database.rowDefaults?.[database.primaryFieldId];

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
        <input
          aria-label="Default row name"
          className={cn(
            "w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50",
            headingSurfaceClassName,
            headingTypographyClassNames[1]
          )}
          defaultValue={typeof defaultName === "string" ? defaultName : ""}
          key={`${database.id}:${typeof defaultName === "string" ? defaultName : ""}`}
          onBlur={(event) => {
            setDatabaseRowDefault(
              database.id,
              database.primaryFieldId,
              event.target.value.trim() || null
            );
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setDatabaseRowDefault(
                database.id,
                database.primaryFieldId,
                event.currentTarget.value.trim() || null
              );
              event.currentTarget.blur();
            }
          }}
          placeholder={primaryField?.name ?? "Name"}
          type="text"
        />
      </div>
      {panelFields.length > 0 ? (
        <div className="mt-6 mb-4 flex flex-col gap-0.5 border-border border-b pb-3">
          {panelFields.map((field) => (
            <RowTemplatePropertyRow
              database={database}
              field={field}
              key={field.id}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
