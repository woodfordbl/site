import { IconArrowUpRight } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCanvasSlashSession } from "@/components/canvas/canvas-menu-context.tsx";
import { SlashMenuItemLabel } from "@/components/canvas/slash-menu-item-label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { getMarkdownShortcutHint } from "@/lib/canvas/markdown-shortcuts.ts";
import { buildRootSlashMenuItems } from "@/lib/canvas/slash-menu-list.ts";
import { filterPageLinkTargetItems } from "@/lib/pages/page-slash-menu.ts";

const slashMenuItemClassName =
  "relative flex w-full cursor-default select-none items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const slashMenuLabelClassName =
  "px-1.5 py-1 font-medium text-muted-foreground text-xs";

function SlashMenuRow({
  children,
  highlighted,
  onClick,
  ref,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
  onClick?: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      className={slashMenuItemClassName}
      data-highlighted={highlighted ? "" : undefined}
      onClick={onClick}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      ref={ref}
      type="button"
    >
      {children}
    </button>
  );
}

export function CanvasMenuSlashContent() {
  const { slashSession } = useCanvasSlashSession();
  const session = slashSession;
  const [linkQuery, setLinkQuery] = useState("");
  const linkSearchRef = useRef<HTMLInputElement>(null);
  const highlightedItemRef = useRef<HTMLButtonElement>(null);

  const rootItems = useMemo(() => {
    if (!session) {
      return [];
    }
    return buildRootSlashMenuItems(
      session.query,
      session.currentPageId,
      session.pages
    );
  }, [session]);

  const linkTargets = useMemo(() => {
    if (!session) {
      return [];
    }
    return filterPageLinkTargetItems(
      linkQuery,
      session.currentPageId,
      session.pages
    );
  }, [linkQuery, session]);

  useEffect(() => {
    if (session?.linkSubOpen && session.slashPhase === "link") {
      linkSearchRef.current?.focus();
      setLinkQuery("");
    }
  }, [session?.linkSubOpen, session?.slashPhase]);

  useEffect(() => {
    if (session?.slashPhase !== "root") {
      return;
    }
    highlightedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [session]);

  if (!session) {
    return null;
  }

  if (session.slashPhase === "link") {
    return (
      <div className="p-1" data-canvas-row-menu>
        <div className="p-1 pb-0">
          <Input
            aria-label="Search pages"
            onChange={(event) => setLinkQuery(event.target.value)}
            placeholder="Search pages…"
            ref={linkSearchRef}
            value={linkQuery}
          />
        </div>
        {linkTargets.length === 0 ? (
          <div className="py-6 text-center text-muted-foreground text-sm">
            No pages found.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto p-1">
            <div className={slashMenuLabelClassName}>Link to</div>
            {linkTargets.map((target) => (
              <SlashMenuRow
                key={target.key}
                onClick={() => {
                  if (target.action.type !== "page.link") {
                    return;
                  }
                  session.onSelectPageLink(target.action.pageId);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{target.label}</span>
                <IconArrowUpRight className="ml-auto text-muted-foreground" />
              </SlashMenuRow>
            ))}
          </div>
        )}
      </div>
    );
  }

  const blockItemCount = rootItems.filter(
    (item) => item.kind === "block"
  ).length;
  const pageItemCount = rootItems.length - blockItemCount;
  const showBlocksHeading = blockItemCount > 0;
  const showPagesHeading = pageItemCount > 0 && blockItemCount === 0;

  return (
    <div className="max-h-72 overflow-y-auto p-1">
      {rootItems.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground text-sm">
          No results found.
        </div>
      ) : null}
      {showBlocksHeading ? (
        <div className={slashMenuLabelClassName}>Blocks</div>
      ) : null}
      {showPagesHeading ? (
        <div className={slashMenuLabelClassName}>Pages</div>
      ) : null}
      {rootItems.map((item, index) => {
        const Icon = item.icon;
        const highlighted = index === session.selectedIndex;

        if (item.kind === "page.link.trigger") {
          return (
            <SlashMenuRow
              highlighted={highlighted}
              key={item.key}
              onClick={() => {
                session.onLinkSubOpenChange(true);
              }}
              ref={highlighted ? highlightedItemRef : undefined}
            >
              <Icon />
              {item.label}
            </SlashMenuRow>
          );
        }

        return (
          <SlashMenuRow
            highlighted={highlighted}
            key={item.key}
            onClick={() => {
              if (item.kind === "block") {
                session.onSelectBlock(item.blockItem);
                return;
              }
              if (item.kind === "page.create") {
                session.onSelectPageCreate();
              }
            }}
            ref={highlighted ? highlightedItemRef : undefined}
          >
            <Icon />
            {item.kind === "block" ? (
              <SlashMenuItemLabel
                hint={getMarkdownShortcutHint(item.blockItem)}
                label={item.label}
              />
            ) : (
              <span>{item.label}</span>
            )}
          </SlashMenuRow>
        );
      })}
    </div>
  );
}
