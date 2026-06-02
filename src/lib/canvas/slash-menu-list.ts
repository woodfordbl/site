import {
  filterSlashMenuItems,
  type SlashMenuItem,
} from "@/components/blocks/registry.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  getNewPageSlashMenuItem,
  getPageLinkTriggerItem,
  hasLinkablePages,
  type PageSlashMenuItem,
} from "@/lib/pages/page-slash-menu.ts";

export type RootSlashMenuItem =
  | {
      blockItem: SlashMenuItem;
      icon: SlashMenuItem["icon"];
      key: string;
      kind: "block";
      label: string;
    }
  | {
      icon: PageSlashMenuItem["icon"];
      key: string;
      kind: "page.create";
      label: string;
      pageItem: PageSlashMenuItem;
    }
  | {
      icon: PageSlashMenuItem["icon"];
      key: string;
      kind: "page.link.trigger";
      label: string;
      pageItem: PageSlashMenuItem;
    };

function matchesSlashQuery(keywords: string[], query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return keywords.some((keyword) => keyword.toLowerCase().includes(normalized));
}

export function buildRootSlashMenuItems(
  query: string,
  currentPageId: string,
  pages: PageSummary[]
): RootSlashMenuItem[] {
  const items: RootSlashMenuItem[] = [];

  for (const blockItem of filterSlashMenuItems(query)) {
    items.push({
      kind: "block",
      key: blockItem.key,
      label: blockItem.label,
      icon: blockItem.icon,
      blockItem,
    });
  }

  const newPageItem = getNewPageSlashMenuItem(currentPageId, pages);
  if (newPageItem && matchesSlashQuery(newPageItem.keywords, query)) {
    items.push({
      kind: "page.create",
      key: newPageItem.key,
      label: newPageItem.label,
      icon: newPageItem.icon,
      pageItem: newPageItem,
    });
  }

  if (hasLinkablePages(currentPageId, pages)) {
    const linkTrigger = getPageLinkTriggerItem();
    if (matchesSlashQuery(linkTrigger.keywords, query)) {
      items.push({
        kind: "page.link.trigger",
        key: linkTrigger.key,
        label: linkTrigger.label,
        icon: linkTrigger.icon,
        pageItem: linkTrigger,
      });
    }
  }

  return items;
}
