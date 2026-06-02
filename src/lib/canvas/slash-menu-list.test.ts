import { describe, expect, it } from "vitest";

import { buildRootSlashMenuItems } from "@/lib/canvas/slash-menu-list.ts";
import type { PageSummary } from "@/lib/content/list-pages.ts";
import {
  getPageLinkTriggerItem,
  PAGE_LINK_TRIGGER_KEY,
} from "@/lib/pages/page-slash-menu.ts";

const pages: PageSummary[] = [
  {
    id: "page-home",
    title: "Home",
    slug: "/",
    parentId: null,
  },
  {
    id: "page-work",
    title: "Work",
    slug: "/work",
    parentId: null,
  },
  {
    id: "page-nested",
    title: "Nested",
    slug: "/work/nested",
    parentId: "page-work",
  },
];

describe("buildRootSlashMenuItems", () => {
  it("orders blocks before page actions", () => {
    const items = buildRootSlashMenuItems("", "page-home", pages);

    expect(items.at(-2)?.kind).toBe("page.create");
    expect(items.at(-1)?.kind).toBe("page.link.trigger");
    expect(items.some((item) => item.kind === "block")).toBe(true);
  });

  it("filters page actions by slash query", () => {
    const items = buildRootSlashMenuItems("new", "page-home", pages);

    expect(items.some((item) => item.kind === "page.create")).toBe(true);
    expect(items.some((item) => item.kind === "page.link.trigger")).toBe(false);
  });

  it("includes the link trigger when query matches link keywords", () => {
    const items = buildRootSlashMenuItems("link", "page-home", pages);

    expect(items).toEqual([
      expect.objectContaining({
        kind: "page.link.trigger",
        key: PAGE_LINK_TRIGGER_KEY,
      }),
    ]);
  });

  it("matches the link trigger item definition", () => {
    const trigger = getPageLinkTriggerItem();

    expect(trigger.key).toBe(PAGE_LINK_TRIGGER_KEY);
    expect(trigger.action.type).toBe("page.link.trigger");
  });
});
