import { IconCopy } from "@tabler/icons-react";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";

import { resolveFieldIcon } from "@/components/database/database-field-icons.ts";
import { PageIconPicker } from "@/components/pages/page-icon-picker.tsx";
import { Button } from "@/components/ui/button.tsx";
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
 * primary cell, nothing to author), and a properties list styled like the
 * real row page's panel — field icon + name, muted type in the value slot,
 * and a hover-revealed copy-token icon. Fields aren't editable here — rows
 * own their values.
 */

/** The inline `{{ Field }}`-styled chip used for the locked title. */
function TokenChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center truncate rounded-md border border-primary/25 bg-primary/10 px-2 font-mono text-primary">
      {children}
    </span>
  );
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
  const token = rowPropertyToken(field.name);

  return (
    <div
      className="flex min-h-8 items-center gap-2 text-sm"
      data-reveal-group=""
    >
      <div className="flex w-36 shrink-0 items-center gap-1.5 text-muted-foreground sm:w-44">
        <FieldIcon className="size-4 shrink-0 stroke-[1.5px]" />
        <span className="truncate">{field.name}</span>
      </div>
      <div className="flex min-h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span className="truncate text-muted-foreground">
          {FIELD_TYPE_DEFS[field.type].label}
        </span>
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
            "flex w-full min-w-0 items-baseline",
            headingSurfaceClassName,
            headingTypographyClassNames[1]
          )}
          title="Row title — always the primary field"
        >
          <TokenChip>{primaryField?.name ?? "Name"}</TokenChip>
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
