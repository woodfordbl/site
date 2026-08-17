/**
 * @fileoverview One rendered line of a page-link hover preview.
 *
 * Preview lines are deliberately lossy stand-ins, not the real blocks: media,
 * embeds, maps, tables and databases render as an icon-and-label chip rather
 * than mounting their real (often heavy, sometimes client-only) renderers
 * inside a hover card.
 */
import {
  IconDatabase,
  IconLink,
  IconMapPin,
  IconPhoto,
  IconTable,
  IconVideo,
  IconWorld,
} from "@tabler/icons-react";
import { eq, useLiveQuery } from "@tanstack/react-db";
import type { ReactNode } from "react";

import { PageIconDisplay } from "@/components/pages/page-icon-display.tsx";
import { localDatabasesCollection } from "@/db/collections/local-collections.ts";
import { usePageSummary } from "@/hooks/use-page-summary.ts";
import type { PageLinkPreviewLine } from "@/lib/pages/page-link-preview-model.ts";
import { cn } from "@/lib/utils.ts";

/** Shared type scale for every preview line. */
const LINE_TEXT_CLASSNAME = "truncate text-[11.5px] leading-4.5";

export function PreviewChipIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground [&_svg]:size-3.5 [&_svg]:stroke-[1.5px]">
      {children}
    </span>
  );
}

/** Media / embed / database / table lines: an icon and a label, never the real thing. */
function PreviewChipLine({
  icon,
  label,
  muted,
}: {
  icon: ReactNode;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <PreviewChipIcon>{icon}</PreviewChipIcon>
      <span
        className={cn(
          LINE_TEXT_CLASSNAME,
          muted ? "text-muted-foreground" : "text-foreground/80"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function PreviewBulletLine({
  depth,
  marker,
  text,
}: {
  depth: number;
  marker: string;
  text: string;
}) {
  return (
    <div
      className="flex min-w-0 items-baseline gap-1.5"
      style={depth > 0 ? { paddingInlineStart: depth * 10 } : undefined}
    >
      <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
        {marker}
      </span>
      <span className={cn(LINE_TEXT_CLASSNAME, "text-foreground/80")}>
        {text}
      </span>
    </div>
  );
}

function PreviewTableLine({ columns }: { columns: string[] }) {
  const labels = columns.filter((label) => label !== "");
  if (labels.length === 0) {
    return <PreviewChipLine icon={<IconTable />} label="Table" muted />;
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <PreviewChipIcon>
        <IconTable />
      </PreviewChipIcon>
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden rounded-sm border border-border px-1">
        {labels.map((label) => (
          <span
            className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground leading-4.5"
            key={label}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PreviewDatabaseLine({ databaseId }: { databaseId: string }) {
  const { data: databases = [] } = useLiveQuery(
    (query) =>
      query
        .from({ database: localDatabasesCollection })
        .where(({ database }) => eq(database.id, databaseId)),
    [databaseId]
  );
  const name = databases[0]?.name?.trim();
  return (
    <PreviewChipLine
      icon={<IconDatabase />}
      label={name || "Database"}
      muted={!name}
    />
  );
}

function PreviewPageLinkLine({ pageId }: { pageId: string }) {
  const page = usePageSummary(pageId);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <PreviewChipIcon>
        {page ? <PageIconDisplay icon={page.icon} /> : <IconLink />}
      </PreviewChipIcon>
      <span
        className={cn(
          LINE_TEXT_CLASSNAME,
          "text-foreground/80 underline decoration-border"
        )}
      >
        {page?.title.trim() || "Untitled"}
      </span>
    </div>
  );
}

const HEADING_CLASSNAMES: Record<1 | 2 | 3 | 4, string> = {
  1: "text-[12.5px] font-semibold",
  2: "text-[12px] font-semibold",
  3: "text-[11.5px] font-semibold",
  4: "text-[11.5px] font-medium",
};

export function PreviewLine({ line }: { line: PageLinkPreviewLine }) {
  switch (line.kind) {
    case "heading":
      return (
        <div
          className={cn(
            "truncate text-foreground leading-5",
            HEADING_CLASSNAMES[line.level]
          )}
        >
          {line.text}
        </div>
      );
    case "text":
      return (
        <div className={cn(LINE_TEXT_CLASSNAME, "text-foreground/80")}>
          {line.text}
        </div>
      );
    case "quote":
      return (
        <div
          className={cn(
            LINE_TEXT_CLASSNAME,
            "border-border border-l-2 pl-2 text-muted-foreground italic"
          )}
        >
          {line.text}
        </div>
      );
    case "callout":
      return (
        <div className="flex min-w-0 items-center gap-1.5 rounded-sm bg-muted px-1.5 py-0.5">
          {line.icon ? (
            <PreviewChipIcon>
              <PageIconDisplay icon={line.icon} />
            </PreviewChipIcon>
          ) : null}
          <span className={cn(LINE_TEXT_CLASSNAME, "text-foreground/80")}>
            {line.text}
          </span>
        </div>
      );
    case "bullet":
      return (
        <PreviewBulletLine
          depth={line.depth}
          marker={line.ordered && line.index ? `${line.index}.` : "•"}
          text={line.text}
        />
      );
    case "checklist":
      return (
        <PreviewBulletLine
          depth={line.depth}
          marker={line.checked ? "☑" : "☐"}
          text={line.text}
        />
      );
    case "divider":
      return <div className="my-1 h-px bg-border" />;
    case "code":
      return (
        <div className="min-w-0 truncate rounded-sm bg-muted px-1.5 font-mono text-[10.5px] text-muted-foreground leading-4.5">
          {line.text || line.language || "Code"}
        </div>
      );
    case "media":
      return (
        <PreviewChipLine
          icon={line.mediaKind === "video" ? <IconVideo /> : <IconPhoto />}
          label={line.text}
        />
      );
    case "embed":
      return <PreviewChipLine icon={<IconWorld />} label={line.text} />;
    case "map":
      return <PreviewChipLine icon={<IconMapPin />} label={line.text} />;
    case "table":
      return <PreviewTableLine columns={line.columns} />;
    case "database":
      return <PreviewDatabaseLine databaseId={line.databaseId} />;
    case "pageLink":
      return <PreviewPageLinkLine pageId={line.pageId} />;
    default: {
      const neverLine: never = line;
      return neverLine;
    }
  }
}
